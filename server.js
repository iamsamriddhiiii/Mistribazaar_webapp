const express = require("express");
const bodyParser = require("body-parser");
const bcrypt = require("bcrypt");
const path = require("path");
const connection = require("./config/db");

const app = express();

app.set("view engine", "ejs");
app.use(express.static("public"));
app.use(bodyParser.urlencoded({extended: true}));
app.use(bodyParser.json());

//Home page
app.get("/",(req,res) => { res.render("home")});

// Default route-> redirect to register
app.get("/start" , (req, res)=> res.redirect("/register"));

//Register page
app.get("/register",(req,res)=> res.render("register",{message: null}));

//Login page
app.get("/login",(req,res)=>res.render("login",{message:null}));


//Register POST route
app.post("/register", async (req, res) => {
  const { name, email, phone, location, role, password } = req.body;
  const hashedPass = await bcrypt.hash(password, 10);

  const sql =
    "INSERT INTO person (name, email, phone, location, role, password) VALUES (?, ?, ?, ?, ?, ?)";
  connection.query(
    sql,
    [name, email, phone, location, role, hashedPass],
    (err) => {
      if (err) {
        console.error(err);
        return res.render("register", { message: "⚠️ Registration failed!" });
      }
      res.render("login", { message: "✅ Registration successful! Please login." });
    }
  );
});


// Login POST route
app.post("/login", (req, res) => {
  const { email, password } = req.body;

  connection.query("SELECT * FROM person WHERE email = ?", [email], async (err, results) => {
    if (err || results.length === 0)
      return res.render("login", { message: "Invalid email or password!" });

    const user = results[0];
    console.log("Logged in user:",user);
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch)
      return res.render("login", { message: "Invalid email or password!" });

    // ✅ Role check karke redirect
    if (user.role === "customer")res.redirect(`/customer/${user.id}`); 
    else if (user.role === "worker") res.redirect(`/worker/${user.id}`);
    else res.render("login", { message: "User role not found!" });
  });
});


// ---------------- Update Profile (Customer) ----------------
app.post("/updateProfile/:id", (req, res) => {
  const id = req.params.id;
  const { name, email, phone, location } = req.body;

  const sql = "UPDATE person SET name=?, email=?, phone=?, location=? WHERE id=?";
  connection.query(sql, [name, email, phone, location, id], (err) => {
    if (err) {
      console.log(err);
      return res.send("Database error while updating profile");
    }

    // Redirect back to customer dashboard after update
    res.redirect(`/customer/${id}`);
  });
});



/// Worker Dashboard
app.get("/worker/:id", (req,res)=>{
  const id = req.params.id;

  // Fetch worker info
  connection.query("SELECT * FROM person WHERE id = ?", [id], (err, userResult)=>{
    if(err) return res.send("Database error");
    const user = userResult[0];
    if(!user) return res.send("User not found");

    //  Fetch worker's work details
    connection.query("SELECT * FROM work_details WHERE person_id = ?", [id], (err, work)=>{
      if(err) console.log(err);

      // Fetch all hire requests for this worker
       const hireSql = `
    SELECT hr.*, p.name AS customer_name, p.phone AS customer_phone
    FROM hire_requests hr
    JOIN person p ON hr.customer_id = p.id
    WHERE hr.worker_id = ?
  `;

      connection.query(hireSql, [id], (err, hires)=>{
        if(err) {
          console.log(err);
          return res.send("Database error (hire requests)");
          res.redirect(`/customer/${customer_id}`);
        }

        // ✅ Render dashboard with all info
        res.render("workerDashboard", { user, work, hires });
      });
    });
  });
});




// Add Work POST
app.post("/addWork/:id", (req,res) => {
  const id = req.params.id;
  const { work_type, experience, charges, description } = req.body;

  const sql = "INSERT INTO work_details (person_id, work_type, experience, charges, description) VALUES (?, ?, ?, ?, ?)";
  connection.query(sql,[id, work_type, experience, charges, description], (err)=>{
    if(err){
      console.log(err);
      return res.send("Database error while adding work");
    }
    res.redirect(`/worker/${id}`);
     });
    });
  

//Customer Dashboard
app.get("/customer/:id", (req, res) => {
  const customerId = req.params.id;

  // 1️⃣ Fetch logged-in customer info
  connection.query("SELECT * FROM person WHERE id = ?", [customerId], (err, userResult) => {
    if (err) return res.send("Database error (user fetch)");
    const user = userResult[0]; // user.name, user.email, etc.

    // 2️⃣ Fetch all workers
    const sqlWorkers = `
      SELECT work_details.*, person.name, person.phone, person.id AS person_id
      FROM work_details 
      JOIN person ON work_details.person_id = person.id
      WHERE person.role = 'worker'
    `;
    connection.query(sqlWorkers, (err, workers) => {
      if (err) return res.send("Database error (workers fetch)");

      // 3️⃣ Fetch customer's hire requests
      const sqlRequests = `
        SELECT hr.*, p.name AS worker_name 
        FROM hire_requests hr
        JOIN person p ON hr.worker_id = p.id
        WHERE hr.customer_id = ?
      `;
      connection.query(sqlRequests, [customerId], (err, requests) => {
        if (err) return res.send("Database error (requests fetch)");

        // 4️⃣ Render dashboard with all data
        res.render("customerDashboard", { user, workers, requests });
      });
    });
  });
});



//Hire POST
app.post("/hire", (req, res) => {
  const { customer_id, worker_id, message } = req.body;
  const sql = "INSERT INTO hire_requests (customer_id, worker_id, message, status) VALUES (?, ?, ?, 'pending')";
  connection.query(sql, [customer_id, worker_id, message], (err) => {
    if (err) {
      console.log(err);
      return res.send("Database error while sending hire request");
    }
    res.redirect(`/customer/${customer_id}`); // Redirect back to dashboard
  });
});

// ---------------- Update Hire Request Status ----------------
app.post("/updateStatus/:id", (req, res) => {
  const hireId = req.params.id;
  const newStatus = req.body.status;
  const workerId = req.body.worker_id;

  if(!workerId){
    console.log("❌ Worker ID missing! Cannot redirect correctly.");
    return res.send("Error: Worker ID missing");
  }
  
  const sql = "UPDATE hire_requests SET status = ? WHERE id = ?";
  connection.query(sql, [newStatus, hireId], (err, result) => {
    if (err) {
      console.error("❌ Error updating status:", err);
      return res.status(500).send("Database error");
    }

    console.log(`✅ Hire request ${hireId} updated to ${newStatus}`);
    res.redirect(`/worker/${workerId}`); // explicit redirect
  });
});



// Logout route
app.get("/logout", (req, res) => {
  // If using session: req.session.destroy();
  res.redirect("/"); // Redirect to home page
});


const PORT = 3000;
app.listen(PORT, () => console.log(`🚀 MistriBazar running at http://localhost:${PORT}`));


