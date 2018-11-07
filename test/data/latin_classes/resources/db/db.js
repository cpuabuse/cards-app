// db.js
"use strict";
const sqlite3 = require("sqlite3").verbose();

/**
 *
 */
async function main(resource){
	var app = resource.root.parent;
	var workDir = await app.system.file.join(app.settings.folders.rc, resource.name);
	var absolutePath = await app.system.file.join(app.system.rootDir, workDir);
	var dbPath = await app.system.file.join(absolutePath, "db.db");

	// Open database
	let db = new sqlite3.Database(dbPath, err => {
		if (err) {
			console.error(err.message);
		}
		console.log("Connected to database.");
	});

	// Analyze request

	// Query
	let sql = "SELECT * FROM words";

	db.all(sql, [], (err, rows) => {
		if (err) {
			throw err;
		}
		rows.forEach(row => {
			console.log(row.q);
		});
	});

	// Close the database
	db.close();

	// Return
	return 0;
}

module.exports = main;