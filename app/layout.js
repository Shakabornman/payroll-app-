import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

export const metadata = {
  title: "HAE HR Payroll",
  description: "Hospital at Ekhaya payroll administration",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
