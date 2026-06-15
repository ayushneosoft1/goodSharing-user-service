import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { buildSubgraphSchema } from "@apollo/subgraph";
import { typeDefs } from "./schema.js";
import { resolvers } from "./resolvers.js";
import dotenv from "dotenv";

dotenv.config();

const server = new ApolloServer({
  schema: buildSubgraphSchema([{ typeDefs, resolvers }]),
});

startStandaloneServer(server, {
  listen: { port: 4001, host: "0.0.0.0" },

  context: async ({ req }) => {
    const xUser = req.headers["x-user"];
    const serviceSecret = req.headers["x-service-secret"];

    console.log("📩 x-user:", xUser);
    console.log("🔐 serviceSecret:", serviceSecret ? "YES" : "NO");

    let user = null;

    if (xUser) {
      try {
        user = JSON.parse(xUser);
      } catch (err) {
        console.log("❌ JSON parse error:", err.message);
      }
    }

    return { user, serviceSecret };
  },
}).then(() => {
  console.log("User Service running on http://0.0.0.0:4001/graphql");
});
