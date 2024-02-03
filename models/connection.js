var mysql = require("mysql2");

const pool = mysql.createPool({
  host: process.env.HOST,
  user: process.env.SQLUSER,
  password: process.env.SQLPASSWORD,
  database: process.env.DATABASE,
});

module.exports = pool;
