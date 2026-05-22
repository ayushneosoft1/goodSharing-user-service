import gql from "graphql-tag";

export const typeDefs = gql`
  type Query {
    getUserDetails: UserResponse
    getAllUserDetails: UsersResponse
  }

  type Mutation {
    signup(
      email: String!
      password: String!
      first_name: String!
      last_name: String!
    ): ApiResponse

    signin(email: String!, password: String!): ApiResponse
  }

  type User @key(fields: "id") {
    id: ID!
    email: String!
    first_name: String!
    last_name: String!
  }

  type UserResponse {
    status: String!
    statusMessage: String!
    data: User
  }

  type UsersResponse {
    status: String!
    statusMessage: String!
    data: [User!]
  }

  type AuthData {
    token: String!
    user: User!
  }

  type ApiResponse {
    status: String!
    statusMessage: String!
    data: AuthData
  }
`;
