import React from "react";
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import EmployeeTable from "./EmployeeTable";

const App = () => {
  return (
      <Router>
          <Routes>
            <Route path="/" element={<Navigate to="/employeeTable" />} />
            <Route path="/employeeTable" element={<EmployeeTable />} />
          </Routes>
      </Router>
  );
};

export default App;
