import Stripe from "stripe";
import "dotenv/config";

if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set");

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
