import { sql } from "@vercel/postgres";
import { CustomersTableType, LatestInvoice, Revenue } from "./definitions";
import { formatCurrency } from "./utils";
import { SupabaseClient } from "@supabase/supabase-js";
import { Database } from "@/app/lib/database.types";

export async function fetchRevenue(
  supabase: SupabaseClient<Database>
): Promise<Revenue[]> {
  // Artificially delay a response for demo purposes.
  // Don't do this in production :)

  // console.log('Fetching revenue data...');
  // await new Promise((resolve) => setTimeout(resolve, 3000));

  // const data = await sql<Revenue>`SELECT * FROM revenue`;
  const { data, error } = await supabase.from("revenue").select();
  if (error) {
    console.error("Database Error:", error);
    throw error;
  }

  const revenue: Revenue[] = data;
  console.log(revenue);
  // console.log('Data fetch completed after 3 seconds.');

  return revenue;
}

export async function fetchLatestInvoices(
  supabase: SupabaseClient<Database>
): Promise<LatestInvoice[]> {
  const { data, error } = await supabase
    .from("invoices")
    .select(`amount, id, customers (name, image_url, email)`)
    .order("date", { ascending: false })
    .limit(5);
  if (error) {
    console.error("Database Error:", error);
    throw error;
  }

  const invoices: LatestInvoice[] = data.map((invoice) => ({
    id: invoice.id,
    name: invoice.customers.name,
    image_url: invoice.customers.image_url,
    email: invoice.customers.email,
    amount: formatCurrency(invoice.amount),
  }));

  return invoices;
}

export async function fetchCardData(
  supabase: SupabaseClient<Database>
): Promise<{
  numberOfCustomers: number;
  numberOfInvoices: number;
  totalPaidInvoices: string;
  totalPendingInvoices: string;
}> {
  try {
    // You can probably combine these into a single SQL query
    // However, we are intentionally splitting them to demonstrate
    // how to initialize multiple queries in parallel with JS.
    const invoiceCountPromise = supabase
      .from("invoices")
      .select("*", { count: "exact", head: true });
    const customerCountPromise = supabase
      .from("customers")
      .select("*", { count: "exact", head: true });
    const invoiceStatusPromise = supabase
      .rpc("invoice_status")
      .select("paid, pending");

    const data = await Promise.all([
      invoiceCountPromise,
      customerCountPromise,
      invoiceStatusPromise,
    ]);

    const numberOfInvoices = Number(data[0]?.count ?? "0");
    const numberOfCustomers = Number(data[1]?.count ?? "0");
    const totalPaidInvoices = formatCurrency(data[2]?.data?.[0]?.paid ?? 0);
    const totalPendingInvoices = formatCurrency(
      data[2]?.data?.[0]?.pending ?? 0
    );

    return {
      numberOfCustomers,
      numberOfInvoices,
      totalPaidInvoices,
      totalPendingInvoices,
    };
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Failed to fetch card data.");
  }
}

const ITEMS_PER_PAGE = 6;
export async function fetchFilteredInvoices(
  supabase: SupabaseClient<Database>,
  query: string,
  currentPage: number
) {
  const offset = (currentPage - 1) * ITEMS_PER_PAGE;

  // const invoices = await sql<InvoicesTable>`
  //   SELECT
  //     invoices.id,
  //     invoices.amount,
  //     invoices.date,
  //     invoices.status,
  //     customers.name,
  //     customers.email,
  //     customers.image_url
  //   FROM invoices
  //   JOIN customers ON invoices.customer_id = customers.id
  //   WHERE
  //     customers.name ILIKE ${`%${query}%`} OR
  //     customers.email ILIKE ${`%${query}%`} OR
  //     invoices.amount::text ILIKE ${`%${query}%`} OR
  //     invoices.date::text ILIKE ${`%${query}%`} OR
  //     invoices.status ILIKE ${`%${query}%`}
  //   ORDER BY invoices.date DESC
  //   LIMIT ${ITEMS_PER_PAGE} OFFSET ${offset}
  // `;

  const { data: invoices, error } = await supabase.rpc("fetch_invoices", {
    query,
    items_per_page: ITEMS_PER_PAGE,
    page_offset: offset,
  });
  if (error) {
    console.error("Database Error:", error);
    throw error;
  }

  return invoices;
}

export async function fetchInvoicesPages(
  query: string,
  supabase: SupabaseClient<Database>
) {
  try {
    //   const count = await sql`SELECT COUNT(*)
    //   FROM invoices
    //   JOIN customers ON invoices.customer_id = customers.id
    //   WHERE
    //     customers.name ILIKE ${`%${query}%`} OR
    //     customers.email ILIKE ${`%${query}%`} OR
    //     invoices.amount::text ILIKE ${`%${query}%`} OR
    //     invoices.date::text ILIKE ${`%${query}%`} OR
    //     invoices.status ILIKE ${`%${query}%`}
    // `;

    const count = await supabase.rpc("count_invoices", {
      query,
    });

    const totalPages = Math.ceil(Number(count.data) / ITEMS_PER_PAGE);
    return totalPages;
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Failed to fetch total number of invoices.");
  }
}

export async function fetchInvoiceById(
  id: string,
  supabase: SupabaseClient<Database>
) {
  try {
    const { data, error } = await supabase
      .from("invoices")
      .select("id, customer_id, amount, status")
      .eq("id", id);

    const invoice = data?.map((invoice) => ({
      ...invoice,
      // Convert amount from cents to dollars
      amount: invoice.amount / 100,
      // Ensure status is correctly typed
      status: invoice.status as "pending" | "paid",
    }));

    return invoice?.[0];
  } catch (error) {
    console.error("Database Error:", error);
    throw new Error("Failed to fetch invoice.");
  }
}

export async function fetchCustomers(supabase: SupabaseClient<Database>) {
  const { data, error } = await supabase
    .from("customers")
    .select("id, name")
    .order("name", { ascending: true });
  if (error) {
    console.error("Database Error:", error);
    throw error;
  }

  return data;
}

export async function fetchFilteredCustomers(query: string) {
  try {
    const data = await sql<CustomersTableType>`
		SELECT
		  customers.id,
		  customers.name,
		  customers.email,
		  customers.image_url,
		  COUNT(invoices.id) AS total_invoices,
		  SUM(CASE WHEN invoices.status = 'pending' THEN invoices.amount ELSE 0 END) AS total_pending,
		  SUM(CASE WHEN invoices.status = 'paid' THEN invoices.amount ELSE 0 END) AS total_paid
		FROM customers
		LEFT JOIN invoices ON customers.id = invoices.customer_id
		WHERE
		  customers.name ILIKE ${`%${query}%`} OR
        customers.email ILIKE ${`%${query}%`}
		GROUP BY customers.id, customers.name, customers.email, customers.image_url
		ORDER BY customers.name ASC
	  `;

    const customers = data.rows.map((customer) => ({
      ...customer,
      total_pending: formatCurrency(customer.total_pending),
      total_paid: formatCurrency(customer.total_paid),
    }));

    return customers;
  } catch (err) {
    console.error("Database Error:", err);
    throw new Error("Failed to fetch customer table.");
  }
}
