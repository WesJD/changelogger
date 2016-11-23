'use strict';

const Routes = require("./routes.js");
const app = require("express")();
app.set("view engine", "pug");
app.set("views", __dirname + "/views");
new Routes(app);
app.listen(3001, () => console.log("Server started on port 3001."));