const fs = require('fs');
const moment = require('moment');
const uuid = require('node-uuid');
const pgp = require('pg-promise')();
const restify = require('restify');


const conf = JSON.parse(fs.readFileSync('conf.json'));
const db = pgp(conf['dbUrl']);

const server = restify.createServer({
  name: 'MyApp'
});
server.use(restify.bodyParser());

async function createUser(req, res, next) {
  try {
    let uid = uuid.v4();
    var out = await db.query("INSERT INTO users VALUES (${id}, ${username})", {
      "id": uid,
      "username": req.params.username
    });

    res.send({id: uid, username: req.params.username});
  } catch (e) {
    if (e.code === '23505') {
      res.send(400, new Error("User already exists."));
    } else {
      res.send(e);
    }
  }

  return next();
}

async function getUser(req, res, next) {
  try {
    var out = await db.one("SELECT * FROM users WHERE username = ${username}", {
      username: req.params.username
    });

    res.send(200, out);
  } catch (e) {
    if (e.code === pgp.errors.queryResultErrorCode.noData) {
      res.send(404);
    } else {
      res.send(e);
    }
  }

  return next();
}

async function deleteUser(req, res, next) {
  let out = await db.oneOrNone("SELECT * FROM users WHERE username = ${username}", {
    username: req.params.username
  });

  if (out) {
    let uid = out.user_id;

    await db.query("DELETE FROM users WHERE user_id = ${uid}", {
      uid: uid
    });

    res.send(204);
  } else {
    res.send(404, new Error("User not found."));
  }

  return next();
}

async function getUid(username) {
  let user = await db.oneOrNone("SELECT user_id FROM users WHERE username = ${username}", {
    username: username
  });

  if (user) {
    return user.user_id;
  }

  return null;
}

function projectToJson(project) {
  return {
      projectName: project.project_name,
      projectId: project.project_id,
      projectDescription: project.project_description
    }
}

async function getProjects(req, res, next) {
  let uid = await getUid(req.params.username);

  if (uid) {
    let projects = await db.query(
      "SELECT * FROM projects WHERE user_id = ${user_id}", {
      user_id: uid
    });

    res.send(projects.map(projectToJson));
  } else {
    res.send(404, new Error("User not found."));
  }

  return next();
}

async function getProject(req, res, next) {
  let uid = await getUid(req.params.username);

  if (uid) {
    let project = await db.oneOrNone(
      "SELECT * FROM projects WHERE user_id = ${uid} AND project_id = ${pid}", {
        uid: uid,
        pid: req.params.project
      }
    );

    if (project) {
      res.send(projectToJson(project));
    } else {
      res.send(404, new Error("Project not found."));
    }
  } else {
    res.send(404, new Error("User not found."));
  }

  return next();
}

async function createProject(req, res, next) {
  req.accepts('application/json');

  let uid = await getUid(req.params.username);

  if (!uid) {
    res.send(404, new Error("User not found."));
    return next();
  }

  let pid = uuid.v4();

  if (req.body === undefined || req.body.name.length === 0) {
    res.send(400, new Error(
      "A JSON body with at least 'name' is required."
      )
    );

    return next();
  }

  try {
    await db.query(
      "INSERT INTO projects VALUES (${uid}, ${pid}, ${name}, ${desc})", {
        uid: uid,
        pid: pid,
        name: req.body.name,
        desc: req.body.description
      });

      res.send(201, {
        projectId: pid,
        projectName: req.body.name,
        projectDescription: req.body.description
      });
    } catch (e) {
      if (e.code ===  '23505') {
        res.send(400, new Error("This project already exists."));
      }
  }

  return next();
}

server.get('/users/:username', getUser);
server.post('/users/create/:username', createUser);
server.del('/users/:username', deleteUser);

server.get('/projects/:username', getProjects);
server.get('/projects/:username/:project', getProject);
server.post('/projects/:username/create', createProject);

server.listen(conf['port']);
