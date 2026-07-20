import { createClient } from "@supabase/supabase-js";
import { auth } from "./firebase";

// Supabase "Third-Party Auth" bridge: no separate Supabase login exists.
// This accessToken hook runs before every Supabase request and hands over
// the current Firebase ID token, which Supabase verifies directly.
// See shared.has_access_level / shared.get_own_employee_number for the
// server-side half of this bridge (uid comes from the token's `sub` claim).
export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    db: { schema: "payroll" },
    accessToken: async () => {
      const user = auth.currentUser;
      if (!user) return null;
      return await user.getIdToken();
    },
  }
);
