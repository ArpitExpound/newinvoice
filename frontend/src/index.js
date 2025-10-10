import React from "react";
import ReactDOM from "react-dom/client";
import { ChakraProvider } from "@chakra-ui/react";
import EmployeeTable from "./EmployeeTable";

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(
  <React.StrictMode>
    <ChakraProvider>
      <EmployeeTable />
    </ChakraProvider>
  </React.StrictMode>
);
