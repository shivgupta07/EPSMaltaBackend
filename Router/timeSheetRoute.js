// Import dependencies
import express from "express";
import {
  employeeDelete,
  employeeDetails,
  employeeDetailsAdd,
  employeeView,
  employeeReport,
  searchEmployee,
  employeeDetailsUpdate,
  clientReport,
} from "../Controller/timeSheetController.js";

// Create an Express router
const router = express.Router();

//Search Employee Route
router.get("/employee", searchEmployee);

// Location , Events , Tasks Route
router.get("/employee/details", employeeDetails);

// Employee Entry Post Route
router.post("/employee/entryadd", employeeDetailsAdd);

// Employee Entry Put Route
router.put("/employee/entryupdate/:id", employeeDetailsUpdate);

// Employee Entry Get Route
router.get("/employee/entryview", employeeView);

// Employee Entry Delete Route
router.delete("/employee/entrydelete/:id", employeeDelete);

// Employee Report GET
router.get("/employee/report", employeeReport);

// Employee Report GET in PDF
router.get("/employee/report-pdf", employeeReport);

// Client Report GET
router.get("/client/report", clientReport);

// Client Report GET in PDF
router.get("/client/report-pdf", clientReport);

// Export the router
export default router;
