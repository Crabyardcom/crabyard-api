import type { Sql } from "postgres";

export interface Env {
  Variables: {
    db: Sql;
  };
}

export interface License {
  id: string;
  email: string;
  key: string;
  plan: string;
  active: boolean;
  stripe_customer_id: string | null;
  stripe_payment_id: string | null;
  created_at: string;
  last_used: string | null;
}
