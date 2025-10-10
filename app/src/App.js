import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { ChakraProvider, Box } from "@chakra-ui/react";
import BillingDashboard from "./billingDoc"; // dashboard file

const App = () => {
  return (
    <ChakraProvider>
      <Router>
        <Box p={4}>
          <Routes>
            <Route path="/" element={<Navigate to="/dashboard" />} />
            <Route path="/dashboard" element={<BillingDashboard />} />
          </Routes>
        </Box>
      </Router>
    </ChakraProvider>
  );
};

export default App;
