import OrderScreen from "@/components/order-screen";
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ orderId: string }>;
  searchParams: Promise<{ token?: string }>;
}) {
  return (
    <OrderScreen
      orderId={(await params).orderId}
      accessToken={(await searchParams).token || ""}
    />
  );
}
