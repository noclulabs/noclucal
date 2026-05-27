import { customType } from "drizzle-orm/pg-core";

// citext: case-insensitive text. Requires the citext extension to be enabled.
export const customCitext = customType<{ data: string; driverData: string }>({
  dataType() {
    return "citext";
  },
});
