import { db } from "@vercel/postgres";
import { createClient } from "@/app/utils/supabase/server";
import { Revenue } from "@/app/lib/definitions";

async function listInvoices() {
  // const data = await db.sql`
  //   SELECT invoices.amount, customers.name
  //   FROM invoices
  //   JOIN customers ON invoices.customer_id = customers.id
  //   WHERE invoices.amount = 666;
  // `;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("revenue")
    .select()
    .returns<Revenue[]>();
  if (error) throw error;
  console.log(typeof data[0]);

  return data;
}

export async function GET() {
  // return Response.json({
  //   message:
  //     "Uncomment this file and remove this line. You can delete this file when you are finished.",
  // });
  try {
    const response = await listInvoices();
    console.log("Response:", response);
    return Response.json(response);
  } catch (error) {
    console.error("Database Error:", error);
    return Response.json({ error }, { status: 500 });
  }
}
