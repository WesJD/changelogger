'use strict';

module.exports = function(app) {

    const storage = require("node-persist");
    const fetch = require("node-fetch");
    const config = require("../config.json");
    const values = Object.keys(config.projects).map(k => config.projects[k]);

    function checkApiStatus(req, res, next) {
        fetch("https://status.github.com/api/status.json")
            .then(response => response.json())
            .then(json => {
                if(json.status == "good") next();
                else return Promise.reject("The GitHub API currently has the status of " + json.status);
            })
            .catch(err => res.render("error", { error: err }));
    }

    function parseLinkHeader(header) {
        const ret = {};

        if(header != null) { //if there was no Link header
            const parts = header.split(", ");
            for(let i = 0; i < parts.length; i++) {
                const part = parts[i];
                ret[part.match(/rel="(\w+)"/)[1]] = parseInt(part.match(/<(.+)&page=(\d+)&(.+)>/)[2]);
            }
        }

        return ret;
    }

    app.use(checkApiStatus);

    app.get("/", (req, res) => res.redirect("/" + config.projects[0]));
    app.get("/:user/:project/:page?", (req, res) => {
        const user = req.params.user;
        const project = req.params.project;
        const combined = user + "/" + project;
        if(values.some(proj => proj == combined)) {
            let page = req.params.page ? parseInt(req.params.page) : 1;
            if(page < 1) page = 1;
            fetch("https://api.github.com/repos/" + combined + "/commits?access_token=" + config.access_token + "&page=" + page + "&per_page=" + config.commitsPerPage)
                .then(response => {
                    if(response.headers.get("X-RateLimit-Remaining") == 0) Promise.reject("Rate limit reached.");
                    return response;
                })
                .then(response => Promise.all([response, response.json()]))
                .then(data => {
                    const response = data[0];
                    const commits = data[1];

                    const supply = {};
                    for(let i = 0; i < commits.length; i++) {
                        const elem = commits[i];

                        const simplifiedDate = new Date(elem.commit.author.date.match(/\d{4}-\d{1,2}-\d{1,2}/)[0]).toDateString();
                        const date = supply[simplifiedDate] = supply[simplifiedDate] == null ? {} : supply[simplifiedDate];
                        const commit = date[elem.sha.substring(0, 8)] = {};

                        const message = elem.commit.message;
                        const index = message.indexOf("\n\n");
                        commit.message = message.substring(0, index != -1 ? index : message.length); //omit description
                        commit.url = elem.html_url;

                        const committer = commit["committer"] = {};
                        committer.name = elem.committer.login;
                        committer.url = elem.committer.html_url;
                    }

                    const parameters = {
                        projects: {
                            current: combined,
                            other: values.slice()
                        },
                        pages: {},
                        commits: supply
                    };

                    const parsedHeaders = parseLinkHeader(response.headers.get("Link"));
                    if(parsedHeaders.prev != null) parameters.pages.previous = parsedHeaders.prev;
                    if(parsedHeaders.next != null) parameters.pages.next = parsedHeaders.next;

                    res.render("index", parameters);
                })
                .catch(response => res.render("error", { error: response }));
        } else res.render("error", { error: "Not a valid project." });
    });

}