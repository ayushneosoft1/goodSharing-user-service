import gql from "graphql-tag";

export const typeDefs = gql`
  type User @key(fields: "id") {
    id: ID!
    email: String!
    name: String!
  }

  type AuthResponse {
    token: String!
    user: User!
  }

  type Query {
    getUserDetails: User
  }

  type Mutation {
    signup(email: String!, password: String!, name: String!): AuthResponse
    signin(email: String!, password: String!): AuthResponse
  }
`;
