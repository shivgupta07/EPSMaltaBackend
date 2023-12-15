import moment from "moment";
import connection from "../index.js";
import { clientPdfGenerate, generatePdfFromData } from "../Service/report.js";
import archiver from "archiver";

// Serach Employee
export const searchEmployee = async (req, res) => {
  try {
    const { username } = req.query;

    // Prepare the query with parameterized query
    let query = "SELECT username, id FROM users WHERE username LIKE ?";
    const parameters = [`%${username}%`];

    // Execute the search query with parameterized query
    const [results] = await connection.execute(query, parameters);

    // Extract usernames and ids from the results
    const employees = results.map((result) => ({
      username: result.username,
      id: result.id,
    }));

    // Return the employees as a JSON response
    res.json(employees);
  } catch (error) {
    // Handle any errors that occur during the search
    console.error("Error searching employees:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Location, Events, Tasks, Client, Title GET API
export const employeeDetails = async (req, res) => {
  try {
    // Prepare the queries to fetch specific columns along with IDs from each table
    const queries = [
      connection.query(`SELECT id, location FROM location`),
      connection.query(`SELECT id, tasks FROM tasks`),
      connection.query(`SELECT id, events FROM events`),
      connection.query(`SELECT id, clientName FROM client`),
      connection.query(`SELECT id, title, type FROM template`),
      connection.query(
        `SELECT DISTINCT year FROM timesheet ORDER BY year DESC`
      ),
    ];

    // Execute the queries in parallel
    const [result1, result2, result3, result4, result5, result6] =
      await Promise.all(queries);

    // Extract the required columns along with IDs from each result
    const locations = result1[0].map((row) => ({
      id: row.id,
      location: row.location,
    }));
    const tasks = result2[0].map((row) => ({
      id: row.id,
      tasks: row.tasks,
    }));
    const events = result3[0].map((row) => ({
      id: row.id,
      events: row.events,
    }));
    const client = result4[0].map((row) => ({
      id: row.id,
      client: row.clientName,
    }));
    const title = result5[0].map((row) => ({
      id: row.id,
      title: row.title,
      type: row.type,
    }));
    const year = result6[0].map((row) => ({
      id: row.id,
      year: row.year,
    }));

    // Combine the data into a single response object
    const data = {
      locations,
      tasks,
      events,
      client,
      title,
      year,
    };

    // Return the data as a JSON response
    res.json(data);
  } catch (error) {
    console.error("Error retrieving employee details:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Employee Entry Add POST API
export const employeeDetailsAdd = async (req, res) => {
  try {
    let {
      employeeIds,
      date,
      locationId,
      eventId,
      taskId,
      startTime,
      hours,
      ratePerHour,
      rate,
      clientId,
    } = req.body;

    // Get the userId from the decoded user object in the request
    const { userId } = req.user;

    const dateInstance = new Date(date);

    // Parse the startTime in the format "hh:mm"
    const [startHour, startMinute] = startTime.split(":").map(Number);

    // Parse the hours as a float
    const hoursFloat = parseFloat(hours);

    // Calculate the endTime
    const endHour = (startHour + Math.floor(hoursFloat)) % 24;
    const endMinute =
      (startMinute + (hoursFloat - Math.floor(hoursFloat)) * 60) % 60;

    // Format the end time as "hh:mm"
    const endTime = `${String(endHour).padStart(2, "0")}:${String(
      endMinute
    ).padStart(2, "0")}`;

    // Fetch the year, month from the date
    const year = dateInstance.getFullYear();
    const month = dateInstance.toLocaleString("default", { month: "short" });
    const week = moment(dateInstance).isoWeek();

    let checkQuery = `
    SELECT * FROM timesheet 
    WHERE employeeId ${employeeIds.length > 1 ? "IN (?)" : "= ?"}
      AND date = ? 
      AND locationId = ? 
      AND eventId = ? 
      AND taskId = ? 
      AND startTime = ? 
      AND endTime = ? 
      AND ratePerHour = ?
  `;

    const checkQueryParams = [
      ...(employeeIds.length > 1 ? [employeeIds] : [employeeIds[0]]),
      date,
      locationId,
      eventId,
      taskId,
      startTime,
      endTime,
      ratePerHour,
    ];

    const [existingEntries] = await connection.query(
      checkQuery,
      checkQueryParams
    );

    if (existingEntries.length > 0) {
      if (employeeIds.length <= 1) {
        return res.status(400).json({ error: "This entry already exists!" });
      }
      const existingIds = existingEntries.map((entry) => entry.employeeId);
      employeeIds = employeeIds.filter((id) => !existingIds.includes(id));
    }

    const query = `
    INSERT INTO timesheet (employeeId, date, locationId, eventId, taskId, startTime, endTime, ratePerHour, hours, cost, year, month, week, createdBy, rate, clientId)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;

    const insertionPromises = employeeIds.map(async (employeeId) => {
      const parameters = [
        employeeId,
        date,
        locationId,
        eventId,
        taskId,
        startTime,
        endTime,
        ratePerHour,
        hoursFloat,
        hoursFloat * ratePerHour,
        year,
        month,
        week,
        userId,
        rate,
        clientId,
      ];

      try {
        const [result] = await connection.execute(query, parameters);
        return result.affectedRows === 1;
      } catch (error) {
        console.error("Error adding employee entry:", error);
        return false;
      }
    });

    const insertionResults = await Promise.all(insertionPromises);

    if (insertionResults.every((result) => result)) {
      res.status(201).json({ message: "Employee entries added successfully" });
    } else {
      res.status(500).json({ message: "Failed to add employee entries" });
    }
  } catch (error) {
    console.error("Error adding employee entries:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Employee Update API
export const employeeDetailsUpdate = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      employeeId,
      date,
      locationId,
      eventId,
      taskId,
      startTime,
      hours,
      ratePerHour,
      rate,
      clientId,
    } = req.body;

    // Get the userId from the decoded user object in the request
    const { userId } = req.user;

    const dateInstance = new Date(date);
    // Parse the startTime in the format "hh:mm"
    const [startHour, startMinute] = startTime.split(":").map(Number);

    // Parse the hours as a float
    const hoursFloat = parseFloat(hours);

    // Calculate the endTime
    const endHour = (startHour + Math.floor(hoursFloat)) % 24;
    const endMinute =
      (startMinute + (hoursFloat - Math.floor(hoursFloat)) * 60) % 60;

    // Format the end time as "hh:mm"
    const endTime = `${String(endHour).padStart(2, "0")}:${String(
      endMinute
    ).padStart(2, "0")}`;

    // Fetch the year, month from the date
    const year = dateInstance.getFullYear();
    const month = dateInstance.toLocaleString("default", { month: "short" });
    const week = moment(dateInstance).isoWeek();

    // Prepare the query with parameterized query
    const query =
      "UPDATE timesheet SET employeeId = ?, date = ?, locationId = ?, eventId = ?, taskId = ?, startTime = ?, endTime = ?, ratePerHour = ?, hours = ?, cost = ?, year = ?, month = ?, week = ?, lastModifiedBy = ?, rate = ?, clientId = ? WHERE timesheet_id = ?";

    const parameters = [
      employeeId,
      date,
      locationId,
      eventId,
      taskId,
      startTime,
      endTime,
      ratePerHour,
      hoursFloat,
      hoursFloat * ratePerHour,
      year,
      month,
      week,
      userId,
      rate,
      clientId,
      id,
    ];

    // Execute the query with parameterized query
    const [result] = await connection.execute(query, parameters);

    // Check if the entry was successfully updated
    if (result.affectedRows === 1) {
      res.status(200).json({ message: "Employee entry updated successfully" });
    } else {
      res.status(500).json({ message: "Failed to update employee entry" });
    }
  } catch (error) {
    // Handle any errors that occur during the entry update
    console.error("Error updating employee entry:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Employee Entry GET API
export const employeeView = async (req, res) => {
  try {
    // Check if user is logged in
    if (req.user.userId && req.user.role === "2") {
      // User is logged in, get the user's ID from the request object (assuming it's stored there)
      const userId = req.user.userId;

      // Prepare the query to fetch employee information for the specific user
      const query = `
        SELECT timesheet.*, employee.username AS username, createdByUser.username AS createdByUsername, modifierUser.username AS lastModifiedByUsername, location.location, events.events, tasks.tasks,client.clientName
        FROM timesheet
        INNER JOIN users AS employee ON timesheet.employeeId = employee.id
        INNER JOIN location ON timesheet.locationId = location.id
        INNER JOIN events ON timesheet.eventId = events.id
        INNER JOIN tasks ON timesheet.taskId = tasks.id
        LEFT JOIN client ON timesheet.clientId = client.id
        LEFT JOIN users AS createdByUser ON timesheet.createdBy = createdByUser.id
        LEFT JOIN users AS modifierUser ON timesheet.lastModifiedBy = modifierUser.id
        WHERE employee.id = ?
      `;

      // Execute the query with the user's ID
      const [result] = await connection.execute(query, [userId]);

      // Prepare the response
      const response = {
        totalCount: result.length,
        employees: result.map((employee) => ({
          ...employee,
        })),
      };

      // Check if any records were found
      if (result.length > 0) {
        res.status(200).json(response);
      } else {
        res.status(404).json({ message: "No employees found for this user" });
      }
    } else {
      // User is not logged in, send a response without user-specific data
      const query = `
        SELECT timesheet.*, employee.username AS username, createdByUser.username AS createdByUsername, modifierUser.username AS lastModifiedByUsername, location.location, events.events, tasks.tasks, client.clientName
        FROM timesheet
        INNER JOIN users AS employee ON timesheet.employeeId = employee.id
        INNER JOIN location ON timesheet.locationId = location.id
        INNER JOIN events ON timesheet.eventId = events.id
        INNER JOIN tasks ON timesheet.taskId = tasks.id
        LEFT JOIN client ON timesheet.clientId = client.id
        LEFT JOIN users AS createdByUser ON timesheet.createdBy = createdByUser.id
        LEFT JOIN users AS modifierUser ON timesheet.lastModifiedBy = modifierUser.id
        ORDER BY timesheet.timesheet_id DESC
      `;

      const [result] = await connection.execute(query);

      const response = {
        totalCount: result.length,
        employees: result.map((employee) => ({
          ...employee,
        })),
      };

      // Check if any records were found
      if (result.length > 0) {
        res.status(200).json(response);
      } else {
        res.status(404).json({ message: "No employees found" });
      }
    }
  } catch (error) {
    // Handle any errors that occur during the retrieval
    console.error("Error retrieving employee information:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};

// Employee Entry Delete API
export const employeeDelete = async (req, res) => {
  try {
    const { id } = req.params;

    // Perform the database query to delete the employee entry
    const query = "DELETE FROM timesheet WHERE timesheet_id = ?";
    await connection.execute(query, [id]);

    res.status(200).json({ message: "Employee entry deleted successfully" });
  } catch (error) {
    console.error("Error deleting employee entry:", error);
    res.status(500).json({ error: "Failed to delete employee entry" });
  }
};

// Employee Report GET
export const employeeReport = async (req, res) => {
  try {
    const {
      year,
      month,
      employeeId,
      locationId,
      eventId,
      taskId,
      page,
      perPage,
      rate,
      clientId,
      action,
      titleId,
    } = req.query;

    // Prepare the base query to fetch employee data
    let query = `
      SELECT timesheet.*, users.username, users.email, location.location, events.events, tasks.tasks, client.clientName, client.email as clientEmail
      FROM timesheet
      INNER JOIN users ON timesheet.employeeId = users.id
      INNER JOIN location ON timesheet.locationId = location.id
      INNER JOIN events ON timesheet.eventId = events.id
      INNER JOIN tasks ON timesheet.taskId = tasks.id
      LEFT JOIN client ON timesheet.clientId = client.id
    `;

    // Prepare the query parameters
    const queryParams = [];

    // Prepare the WHERE clause for filtering by year and month
    const whereClause = [];

    if (year) {
      whereClause.push("timesheet.year = ?");
      queryParams.push(year);
    }

    if (month) {
      whereClause.push("timesheet.month = ?");
      queryParams.push(month);
    }

    if (employeeId) {
      whereClause.push("timesheet.employeeId = ?");
      queryParams.push(employeeId);
    }

    if (locationId) {
      whereClause.push("timesheet.locationId = ?");
      queryParams.push(locationId);
    }

    if (eventId) {
      whereClause.push("timesheet.eventId = ?");
      queryParams.push(eventId);
    }

    if (taskId) {
      whereClause.push("timesheet.taskId = ?");
      queryParams.push(taskId);
    }

    if (rate) {
      whereClause.push("timesheet.rate = ?");
      queryParams.push(rate);
    }

    if (clientId) {
      whereClause.push("timesheet.clientId = ?");
      queryParams.push(clientId);
    }

    // Add the WHERE clause to the query if filters are provided
    if (whereClause.length > 0) {
      query += " WHERE " + whereClause.join(" AND ");
    }

    // Pagination
    if (action === "download") {
      // Do nothing, as action is "download"
    } else {
      if (page && perPage) {
        const offset = (parseInt(page) - 1) * parseInt(perPage);
        query += ` LIMIT ${parseInt(perPage)} OFFSET ${offset}`;
      }
    }
    // Get the total count of records
    const [countResult] = await connection.execute(
      `SELECT COUNT(*) as totalCount FROM timesheet` +
        (whereClause.length > 0 ? ` WHERE ${whereClause.join(" AND ")}` : ""),
      queryParams
    );
    const totalCount = countResult[0].totalCount;
    const totalPages = Math.ceil(totalCount / parseInt(perPage));

    // Execute the query with the given parameters
    const [result] = await connection.execute(query, queryParams);

    // Prepare the response data structure
    const reports = [];

    // Initialize variables for grand total
    let grandTotalShift = 0;
    let grandTotalHours = 0;
    let grandTotalCost = 0;

    // Iterate over the result and organize the records by username, year, and month
    for (const record of result) {
      let employeeData = reports.find(
        (item) => item.username === record.username
      );

      if (!employeeData) {
        employeeData = {
          username: record.username,
          email: record.email,
          clientEmail: record.clientEmail,
          records: [],
          total: {
            shift: 0,
            hours: 0,
            cost: 0,
          },
        };
        reports.push(employeeData);
      }

      let rateData = employeeData.records.find(
        (item) => item.rate === record.rate
      );

      if (!rateData) {
        rateData = {
          rate: record.rate,
          records: [],
        };
        employeeData.records.push(rateData);
      }

      let yearData = rateData.records.find((item) => item.year === record.year);

      if (!yearData) {
        yearData = {
          year: record.year,
          records: [],
          total: {
            shift: 0,
            hours: 0,
            cost: 0,
          },
        };
        rateData.records.push(yearData);
      }

      let monthData = yearData.records.find(
        (item) => item.month === record.month
      );

      if (!monthData) {
        monthData = {
          month: record.month,
          records: [],
          total: {
            shift: 0,
            hours: 0,
            cost: 0,
          },
        };
        yearData.records.push(monthData);
      }

      const formattedRecord = {
        date: record.date,
        location: record.location,
        event: record.events,
        task: record.tasks,
        clientName: record.clientName,
        timesheet_id: record.timesheet_id,
        startTime: record.startTime,
        endTime: record.endTime,
        ratePerHour: record.ratePerHour,
        hours: record.hours,
        cost: record.cost,
        week: record.week,
        locationId: record.locationId,
        eventId: record.eventId,
        taskId: record.taskId,
        rate: record.rate,
        clientId: record.clientId,
        username: record.username,
        employeeId: record.employeeId,
      };

      monthData.records.push(formattedRecord);

      // Update the monthly total shift, hours, and cost
      monthData.total.shift += 1;
      monthData.total.hours += parseFloat(record.hours);
      monthData.total.cost += parseFloat(record.cost);

      // Update the yearly total shift, hours, and cost
      yearData.total.shift += 1;
      yearData.total.hours += parseFloat(record.hours);
      yearData.total.cost += parseFloat(record.cost);

      // Update the employee's total shift, hours, and cost
      employeeData.total.shift += 1;
      employeeData.total.hours += parseFloat(record.hours);
      employeeData.total.cost += parseFloat(record.cost);

      // Update the grand total shift, hours, and cost
      grandTotalShift += 1;
      grandTotalHours += parseFloat(record.hours);
      grandTotalCost += parseFloat(record.cost);
    }

    if (result.length > 0) {
      if (action === "download" && titleId) {
        try {
          const tempQuery = "SELECT timesheetName FROM template WHERE id = ?";
          const [result] = await connection.query(tempQuery, [titleId]);
          const tempString = result[0].timesheetName;
          const template = tempString
            .split(",")
            .map((columnName) => columnName.trim());

          if (reports.length === 1) {
            const report = reports[0];
            const pdfBuffer = await generatePdfFromData([report], template);

            const username = report.username || "employee";

            const filename = `${username}_employee_report.pdf`;

            res.attachment(filename);
            res.send(pdfBuffer);
          } else if (reports.length > 1) {
            const zip = archiver("zip");
            res.attachment("employee_reports.zip");
            zip.pipe(res);

            for (const report of reports) {
              const pdfBuffer = await generatePdfFromData([report], template);

              const username = report.username || "employee";

              const filename = `${username}_employee_report.pdf`;

              zip.append(pdfBuffer, { name: filename });
            }

            zip.finalize();
          } else {
            res.status(404).json({ message: "No reports found for download" });
          }
        } catch (error) {
          console.error("Error generating PDF or ZIP:", error);
          res.status(500).json({ message: "Error generating PDF or ZIP" });
        }
      } else if (action === "send") {
        try {
          const insertResult = { ...req.query };

          delete insertResult.page;
          delete insertResult.perPage;

          await connection.execute(
            "INSERT INTO queue_worker (action, action_parameters) VALUES (?, ?)",
            [action, JSON.stringify(insertResult)]
          );

          res.status(200).json({ message: "Data inserted and emails sent." });
        } catch (error) {
          console.error("Error insert data in queue_worker:", error);
          res
            .status(500)
            .json({ message: "Error insert data in queue_worker" });
        }
      } else {
        res.status(200).json({
          reports,
          grandTotal: {
            shift: grandTotalShift,
            hours: grandTotalHours,
            cost: grandTotalCost,
          },
          pagination: {
            totalCount,
            totalPages,
            currentPage: parseInt(page),
            perPageCount: parseInt(perPage),
          },
        });
      }
    } else {
      res.status(404).json({
        message: "No employees found for the given year and month",
      });
    }
  } catch (error) {
    console.error(
      "Error retrieving employee information by year and month:",
      error
    );
    res.status(500).json({ message: "Internal server error" });
  }
};

// Client Timesheet start -----------------------------------------------------------------------------

export const clientReport = async (req, res) => {
  try {
    const {
      year,
      month,
      employeeId,
      locationId,
      eventId,
      taskId,
      page,
      perPage,
      rate,
      clientId,
      action,
      titleId,
    } = req.query;

    // Prepare the base query to fetch employee data
    let query = `
      SELECT timesheet.*, users.username, users.email, location.location, events.events, tasks.tasks, client.clientName, client.email as clientEmail
      FROM timesheet
      INNER JOIN users ON timesheet.employeeId = users.id
      INNER JOIN location ON timesheet.locationId = location.id
      INNER JOIN events ON timesheet.eventId = events.id
      INNER JOIN tasks ON timesheet.taskId = tasks.id
      LEFT JOIN client ON timesheet.clientId = client.id
    `;

    // Prepare the query parameters
    const queryParams = [];

    // Prepare the WHERE clause for filtering by year and month
    const whereClause = [];

    if (year) {
      whereClause.push("timesheet.year = ?");
      queryParams.push(year);
    }

    if (month) {
      whereClause.push("timesheet.month = ?");
      queryParams.push(month);
    }

    if (employeeId) {
      whereClause.push("timesheet.employeeId = ?");
      queryParams.push(employeeId);
    }

    if (locationId) {
      whereClause.push("timesheet.locationId = ?");
      queryParams.push(locationId);
    }

    if (eventId) {
      whereClause.push("timesheet.eventId = ?");
      queryParams.push(eventId);
    }

    if (taskId) {
      whereClause.push("timesheet.taskId = ?");
      queryParams.push(taskId);
    }

    if (rate) {
      whereClause.push("timesheet.rate = ?");
      queryParams.push(rate);
    }

    if (clientId) {
      whereClause.push("timesheet.clientId = ?");
      queryParams.push(clientId);
    }

    // Add the WHERE clause to the query if filters are provided
    if (whereClause.length > 0) {
      query += " WHERE " + whereClause.join(" AND ");
    }

    // Pagination
    if (action === "download-client") {
      // Do nothing, as action is "download"
    } else {
      if (page && perPage) {
        const offset = (parseInt(page) - 1) * parseInt(perPage);
        query += ` LIMIT ${parseInt(perPage)} OFFSET ${offset}`;
      }
    }
    // Get the total count of records
    const [countResult] = await connection.execute(
      `SELECT COUNT(*) as totalCount FROM timesheet` +
        (whereClause.length > 0 ? ` WHERE ${whereClause.join(" AND ")}` : ""),
      queryParams
    );
    const totalCount = countResult[0].totalCount;

    // Calculate total pages for pagination
    const totalPages = Math.ceil(totalCount / parseInt(perPage));

    const [result] = await connection.execute(query, queryParams);

    // Prepare the response data structure
    const clientReports = [];
    const grandTotal = {
      shift: 0,
      hours: 0,
      cost: 0,
    };

    // Iterate over the result and organize the records by client, location, username, year, month, and date
    for (const record of result) {
      let clientData = clientReports.find(
        (item) => item.client === record.clientName
      );

      if (!clientData) {
        clientData = {
          client: record.clientName,
          clientEmail: record.clientEmail,
          records: [],
          total: {
            shift: 0,
            hours: 0,
            cost: 0,
          },
        };
        clientReports.push(clientData);
      }

      let locationData = clientData.records.find(
        (item) => item.locationId === record.locationId
      );

      if (!locationData) {
        locationData = {
          location: record.location,
          locationId: record.locationId,
          records: [],
          total: {
            shift: 0,
            hours: 0,
            cost: 0,
          },
        };
        clientData.records.push(locationData);
      }

      let userData = locationData.records.find(
        (item) => item.username === record.username
      );

      if (!userData) {
        userData = {
          username: record.username,
          records: [],
        };
        locationData.records.push(userData);
      }

      let yearData = userData.records.find((item) => item.year === record.year);

      if (!yearData) {
        yearData = {
          year: record.year,
          records: [],
        };
        userData.records.push(yearData);
      }

      let monthData = yearData.records.find(
        (item) => item.month === record.month
      );

      if (!monthData) {
        monthData = {
          month: record.month,
          records: [],
        };
        yearData.records.push(monthData);
      }

      const formattedRecord = {
        date: record.date,
        rate: record.rate,
        event: record.events,
        task: record.tasks,
        timesheet_id: record.timesheet_id,
        startTime: record.startTime,
        endTime: record.endTime,
        ratePerHour: record.ratePerHour,
        hours: parseFloat(record.hours),
        cost: parseFloat(record.cost),
      };

      monthData.records.push(formattedRecord);

      locationData.total.shift++;
      locationData.total.hours += formattedRecord.hours;
      locationData.total.cost += formattedRecord.cost;

      clientData.total.shift++;
      clientData.total.hours += formattedRecord.hours;
      clientData.total.cost += formattedRecord.cost;

      grandTotal.shift++;
      grandTotal.hours += formattedRecord.hours;
      grandTotal.cost += formattedRecord.cost;
    }

    if (result.length > 0) {
      if (action === "download-client" && titleId) {
        try {
          const tempQuery = "SELECT timesheetName FROM template WHERE id = ?";
          const [result] = await connection.query(tempQuery, [titleId]);
          const tempString = result[0].timesheetName;
          const template = tempString
            .split(",")
            .map((columnName) => columnName.trim());

          if (clientReports.length === 1) {
            const report = clientReports[0];
            const pdfBuffer = await clientPdfGenerate([report], template);

            const client = report.client || "client";

            const filename = `${client}_client_report.pdf`;

            res.attachment(filename);
            res.send(pdfBuffer);
          } else if (clientReports.length > 1) {
            const zip = archiver("zip");
            res.attachment("client_reports.zip");
            zip.pipe(res);

            for (const report of clientReports) {
              const pdfBuffer = await clientPdfGenerate([report], template);

              const client = report.client || "employee";

              const filename = `${client}_client_report.pdf`;

              zip.append(pdfBuffer, { name: filename });
            }

            zip.finalize();
          } else {
            res
              .status(404)
              .json({ message: "No clientReports found for download" });
          }
        } catch (error) {
          console.error("Error generating PDF or ZIP:", error);
          res.status(500).json({ message: "Error generating PDF or ZIP" });
        }
      } else if (action === "send-client") {
        try {
          const insertResult = { ...req.query };

          delete insertResult.page;
          delete insertResult.perPage;

          await connection.execute(
            "INSERT INTO queue_worker (action, action_parameters) VALUES (?, ?)",
            [action, JSON.stringify(insertResult)]
          );

          res.status(200).json({ message: "Data inserted and emails sent." });
        } catch (error) {
          console.error("Error insert data in queue_worker:", error);
          res
            .status(500)
            .json({ message: "Error insert data in queue_worker" });
        }
      } else {
        const response = {
          reports: clientReports,
          grandTotal: grandTotal,
          pagination: {
            totalCount: totalCount,
            totalPages: totalPages,
            currentPage: parseInt(page) || 1,
            perPageCount: parseInt(perPage) || 0,
          },
        };

        res.status(200).json(response);
      }
    } else {
      res.status(404).json({
        message: "No employees found for the given year and month",
      });
    }
  } catch (error) {
    console.error(
      "Error retrieving employee information by year and month:",
      error
    );
    res.status(500).json({ message: "Internal server error" });
  }
};
