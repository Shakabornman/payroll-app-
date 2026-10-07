import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";

export const metadata = {
  title: "HAE HR Payroll",
  description: "Hospital at Ekhaya payroll administration",
};

// Runs before the page paints so there is no flash of the wrong theme.
const THEME_INIT = `(function(){try{var t=localStorage.getItem("theme");var d=t==="dark"||((!t||t==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d);}catch(e){}})();`;

export default function RootLayout({ children }) {
  return (
    <html lang="en" className="h-full antialiased" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body className="min-h-full flex flex-col">
        <AuthProvider>{children}</AuthProvider>
      </body>
    </html>
  );
}
