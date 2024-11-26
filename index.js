import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt from "bcrypt";
import session from "express-session";
import passport from "passport";
import { Strategy } from "passport-local";
import env from "dotenv";
import GoogleStratergy from "passport-google-oauth2";

const app = express();
const port = process.env.PORT;
const saltRounds = 10;
env.config();

app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: {
      maxAge: 1000 * 60 * 60 * 24,
    },
  })
);
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(passport.initialize());
app.use(passport.session());

const db = new pg.Client({
  user: process.env.PG_USER,
  host: process.env.PG_HOST,
  database: process.env.PG_DATABASE,
  password: process.env.PG_PASSWORD,
  port: process.env.PG_PORT,
});
db.connect();

//handle router
app.get("/", (req, res) => {
  res.render("home.ejs");
});
app.get("/login", (req, res) => {
  res.render("login.ejs");
});
app.get("/register", (req, res) => {
  res.render("register.ejs");
});

// app.get("/blog", (req, res) => {
//   console.log(req.user);
//   if (req.isAuthenticated()) {
//     res.render("blog.ejs");
//   } else {
//     res.redirect("/login");
//   }
// });

app.get("/blog", async (req, res) => {
  if (req.isAuthenticated()) {
    try {
      const result = await db.query("SELECT * FROM posts WHERE user_id = $1 ORDER BY created_at DESC", [req.user.id]);
      res.render("blog.ejs", { posts: result.rows });
    } catch (error) {
      console.error("Error fetching posts:", error);
      res.status(500).json({ message: "Error fetching posts" });
    }
  } else {
    res.redirect("/login");
  }
});

app.get("/new", (req, res) => {
  if (req.isAuthenticated()) {
    res.render("modify.ejs", {
      heading: "New Post",
      submit: "Create Post",
      post: null,
      user_id: req.user.id,
    });
  } else {
    res.redirect("/login");
  }
});

app.get("/edit/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const result = await db.query("SELECT * FROM posts WHERE id = $1", [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Post not found" });
    }
    res.render("modify.ejs", {
      heading: "Edit Post",
      submit: "Update Post",
      post: result.rows[0],
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching post" });
  }
});

app.get("/all-posts", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM posts ORDER BY created_at DESC");
    res.render("all-post.ejs", { posts: result.rows });
  } catch (error) {
    console.error("Error fetching posts:", error);
    res.status(500).json({ message: "Error fetching posts" });
  }
});


app.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  })
);

app.get(
  "/auth/google/blog",
  passport.authenticate("google", {
    successRedirect: "/blog",
    failureRedirect: "/login",
  })
);

app.get("/logout", (req, res) => {
  req.logout((err) => {
    if (err) console.log(err);
    res.redirect("/");
  });
});

app.post(
  "/login",
  passport.authenticate("local", {
    successRedirect: "/blog",
    failureRedirect: "/login",
  })
);
//posts

app.get("/blog", async (req, res) => {
  try {
    const result = await db.query("SELECT * FROM posts ORDER BY date DESC");
    res.render("blog.ejs", { posts: result.rows });
  } catch (error) {
    res.status(500).json({ message: "Error fetching posts" });
  }
});

app.post("/posts/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  const { title, content, author, user_id } = req.body;
  try {
    const result = await db.query(
      "UPDATE posts SET title = COALESCE($1, title), content = COALESCE($2, content), author = COALESCE($3, author), user_id = COALESCE($4, user_id) WHERE id = $5 RETURNING *",
      [title, content, author, user_id, id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Post not found" });
    }
    res.redirect("/blog");
  } catch (error) {
    res.status(500).json({ message: "Error updating post" });
  }
});

// insert into posts
app.post("/posts", async (req, res) => {
  const { title, content, author, } = req.body;
  const user_id = req.user.id;
  console.log("Request body:", req.body);

  try {
    const result = await db.query(
      "INSERT INTO posts (title, content, author, user_id) VALUES ($1, $2, $3, $4) RETURNING *",
      [title, content, author, user_id]
    );
    console.log("Post created:", result.rows[0]);
    res.redirect("/blog");
  } catch (error) {
    console.error("Error creating post:", error);
    res.status(500).json({ message: "Error creating post" });
  }
});

app.get("/posts/delete/:id", async (req, res) => {
  const id = parseInt(req.params.id);
  try {
    const result = await db.query(
      "DELETE FROM posts WHERE id = $1 RETURNING *",
      [id]
    );
    if (result.rows.length === 0) {
      return res.status(404).json({ message: "Post not found" });
    }
    res.redirect("/blog");
  } catch (error) {
    res.status(500).json({ message: "Error deleting post" });
  }
});

//authenticate

app.post("/register", async (req, res) => {
  const email = req.body.username;
  const password = req.body.password;

  try {
    const checkResult = await db.query("SELECT * FROM users WHERE email = $1", [
      email,
    ]);

    if (checkResult.rows.length > 0) {
      res.send("Email is already exist, try log in ");
    } else {
      bcrypt.hash(password, saltRounds, async (err, hash) => {
        if (err) {
          console.log("Error hashing password", err);
        } else {
          const result = await db.query(
            "INSERT INTO users (email, password) VALUES ($1,$2) RETURNING * ;",
            [email, hash]
          );
          const user = result.rows[0];
          req.login(user, (err) => {
            console.log(err);
            res.redirect("/blog");
          });
        }
      });
    }
  } catch (err) {
    console.log(err);
  }
});

passport.use(
  "local",
  new Strategy(async function verify(username, password, cb) {
    try {
      const result = await db.query("SELECT * FROM users WHERE email = $1 ", [
        username,
      ]);
      if (result.rows.length > 0) {
        const user = result.rows[0];
        const storedHashPassword = user.password;

        bcrypt.compare(password, storedHashPassword, (err, result) => {
          if (err) {
            return cb(err);
          } else {
            if (result) {
              return cb(null, user);
            } else {
              return cb(null, false);
            }
          }
        });
      } else {
        return cb("User Not Found");
      }
    } catch (err) {
      return cb(err);
    }
  })
);

passport.use(
  "google",
  new GoogleStratergy(
    {
      clientID: process.env.GOOGLE_CLIENT_ID,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET,
      callbackURL: "http://localhost:3000/auth/google/blog",
      userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo",
    },
    async (accessToken, refreshToken, profile, cb) => {
      console.log(profile);
      try {
        const result = await db.query("SELECT * FROM users WHERE email = $1", [
          profile.email,
        ]);
        if (result.rows.length === 0) {
          const newUser = await db.query(
            "INSERT INTO users (email, password) VALUES ($1, $2)",
            [profile.email, "google"]
          );
          return cb(null, newUser.rows[0]);
        } else {
          return cb(null, result.rows[0]);
        }
      } catch (err) {
        return cb(err);
      }
    }
  )
);

passport.serializeUser((user, cb) => {
  cb(null, user);
});

passport.deserializeUser((user, cb) => {
  cb(null, user);
});

app.listen(port, () => {
  console.log(`listening on port ${port}`);
});
