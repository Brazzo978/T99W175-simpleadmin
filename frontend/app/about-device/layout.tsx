import { AppLayout } from "@/components/app-layout";

export default function AboutDeviceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <AppLayout>{children}</AppLayout>;
}
