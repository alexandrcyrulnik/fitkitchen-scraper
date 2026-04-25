import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Fitkitchen Menu",
  description: "Еженедельное меню Fitkitchen тариф Fit",
  icons: { icon: "/icon.png" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body style={{ margin: 0, background: "#fff" }}>{children}</body>
    </html>
  );
}
