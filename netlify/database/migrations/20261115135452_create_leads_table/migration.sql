CREATE TABLE "leads" (
	"id" serial PRIMARY KEY,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"business" text,
	"location" text,
	"service" text,
	"budget" text,
	"message" text,
	"consent" text NOT NULL,
	"created_at" timestamp DEFAULT now()
);
