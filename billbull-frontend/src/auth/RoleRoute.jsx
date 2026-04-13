import React from "react";
import { Navigate } from "react-router-dom";
import { isAuthenticated, hasRole } from "../api/auth";

const RoleRoute = ({ role, children }) => {

  if (!isAuthenticated()) {
    return <Navigate to="/login" replace />;
  }

  const allowedRoles =
    typeof role === "string" ? role.split("|") : [role];

  const isAllowed = allowedRoles.some(r => hasRole(r));

  if (!isAllowed) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
};

export default RoleRoute;
