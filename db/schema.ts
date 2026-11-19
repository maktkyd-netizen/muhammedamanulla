import { pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

export const leads = pgTable("leads", {
  id: serial().primaryKey(),
  name: text().notNull(),
  phone: text().notNull(),
  business: text(),
  location: text(),
  service: text(),
  budget: text(),
  message: text(),
  consent: text().notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

export type Lead = typeof leads.$inferSelect;
export type NewLead = typeof leads.$inferInsert;
