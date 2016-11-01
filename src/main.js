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

async function getPid(uid, project) {
  let proj = await db.oneOrNone(
    "SELECT project_id FROM projects WHERE project_name = ${pname} AND user_id = ${uid}", {
      pname: project,
      uid: uid
    }
  );

  if (proj) {
    return proj.project_id;
  } else {
    return null;
  }
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
      "SELECT * FROM projects WHERE user_id = ${uid} AND project_name = ${pname}", {
        uid: uid,
        pname: req.params.project
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
  let desc = req.body ? req.body.description : null;

  try {
    await db.query(
      "INSERT INTO projects VALUES (${uid}, ${pid}, ${name}, ${desc})", {
        uid: uid,
        pid: pid,
        name: req.params.project,
        desc: desc
      });

      res.send(201, {
        projectId: pid,
        projectName: req.params.project,
        projectDescription: desc
      });
    } catch (e) {
      if (e.code ===  '23505') {
        res.send(400, new Error("This project already exists."));
      }
  }

  return next();
}

async function deleteProject(req, res, next) {
  let uid = await getUid(req.params.username);

  if (uid) {
    let pid = await getPid(uid, req.params.project);

    if (pid) {
      await db.query("DELETE FROM projects WHERE project_id = ${pid}", {
        pid: pid
      });
      res.send(204);
    } else {
      res.send(404, new Error("Project not found."));
    }
  } else {
    res.send(404, new Error("User not found."));
  }

  return next();
}

async function startSession(req, res, next) {
  let uid = await getUid(req.params.username);

  if (uid) {
    let pid = await getPid(uid, req.params.project)

    if (req.body && req.body.description) {
      var desc = req.body.description;
    } else {
      var desc = null;
    }

    if (pid) {
      let sid = uuid.v4();
      await db.query(
        "INSERT INTO session_start VALUES (${uid}, ${sid}, ${pid}, 'now'::timestamp, ${desc})", {
          uid: uid,
          sid: sid,
          pid: pid.project_id,
          desc: desc
        }
      );

      res.send(200, {sessionId: sid});
    } else {
      res.send(404, new Error("Project not found."));
    }
  } else {
    res.send(404, new Error("User not found."));
  }

  return next();
}

async function endSession(req, res, next) {
  let session = await db.oneOrNone(
    "SELECT * FROM session_start WHERE session_id = ${sid}", {
      sid: req.params.session
    }
  );

  if (session) {
    let sid = session.session_id;
    await db.query(
      "INSERT INTO session_end VALUES (${uid}, ${sid}, ${pid}, 'now')", {
        uid: session.user_id,
        sid: sid,
        pid: session.project_id
      }
    );

    res.send(204);
  } else {
    res.send(404, new Error("Session not found."));
  }

  return next();
}

async function getSessionStatus(sid) {
  let statusQuery = `
SELECT
  s.session_id AS sid,
  s.user_id AS uid,
  s.project_id AS pid,
  s.start_time AS starttime,
  s.session_description AS desc,
  e.end_time AS endtime,
  ceil(extract(EPOCH FROM (coalesce(end_time, 'now') - start_time)) / 3600) AS hours,
  'now'::TIMESTAMP WITHOUT TIME ZONE - start_time AS total
FROM session_start AS s LEFT OUTER JOIN session_end AS e ON s.session_id = e.session_id
WHERE s.session_id = $<sid>`;

  let data = await db.oneOrNone(statusQuery, {
    sid: sid
  });

  if (data) {
    return {
      userId: data.uid,
      sessionId: data.sid,
      projectId: data.pid,
      endTime: data.endtime,
      startTime: data.starttime,
      description: data.desc,
      hours: data.hours,
      total: data.total,
      active: !data.endtime ? true : false
    };
  } else {
    return null;
  }
}

async function getSessions(req, res, next) {
  // TODO
}

async function sessionStatus(req, res, next) {
  let sid = req.params.session;
  let status = await getSessionStatus(sid);

  if (status) {
    res.send(status);
  } else {
    res.send(404, "Start session not found.");
  }

  return next();
}

server.get('/users/:username', getUser);
server.post('/users/:username', createUser);
server.del('/users/:username', deleteUser);

server.get('/projects/:username', getProjects);
server.get('/projects/:username/:project', getProject);
server.post('/projects/:username/:project', createProject);
server.del('/projects/:username/:project', deleteProject);

server.post('/sessions/start/:username/:project', startSession);
server.post('/sessions/end/:session', endSession);
server.get('/sessions/:username/:project', getSessions);
server.get('/sessions/:session', sessionStatus);

server.listen(conf['port']);
