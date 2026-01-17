import { ApolloServer } from "@apollo/server";
import { startStandaloneServer } from "@apollo/server/standalone";
import { buildSubgraphSchema } from "@apollo/subgraph";
import { typeDefs } from "./schema.js";
import { resolvers } from "./resolvers.js";

const server = new ApolloServer({
  schema: buildSubgraphSchema([{ typeDefs, resolvers }]),
});

startStandaloneServer(server, {
  listen: { port: 4001, host: "0.0.0.0" },
  context: async ({ req }) => {
    const xUser = req.headers["x-user"];

    console.log("📩 x-user header received:", xUser);

    return {
      user: xUser ? JSON.parse(xUser) : null,
    };
  },
}).then(() => {
  console.log("User Service running on http://0.0.0.0:4001/graphql");
});
