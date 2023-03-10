require("dotenv").config();
const path = require('path');
const express = require("express");
const app = express();
const session = require("express-session");
const passport = require("passport");
const passportLocalMongoose = require("passport-local-mongoose");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const FacebookStrategy = require('passport-facebook').Strategy;
const AmazonStrategy = require('passport-amazon');
const findOrCreate = require('mongoose-findorcreate')
//! now using md5 (hashing function)
// const encrypt = require("mongoose-encryption");

app.use(express.static("public"));
app.use(bodyParser.urlencoded({ extended: true }));

app.set('views', path.join(__dirname, 'views'));
app.engine('ejs', require('ejs').renderFile);
app.set('view engine', 'ejs');

//! passport js and express session app.use()
app.use(session({
  secret: 'Our little secret.',
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());
//! mongoose setup
const mongoose = require("mongoose");
const e = require("express");
const mongoUser = process.env.USER;
const mongoPassword = process.env.PASSWORD;
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});
// mongoose.connect("mongodb://localhost:27017/userDB");

const userSchema = new mongoose.Schema({
  email: String,
  password: String,
  google_id: String,
  secret: [type = String],
  username: String,
  name: String
});

//! passport-local-mongoose
userSchema.plugin(passportLocalMongoose);
userSchema.plugin(findOrCreate);
//! passport js setup

const User = new mongoose.model("User", userSchema);
passport.use(User.createStrategy());
//! this was from passport-local-mongoose, so not work everytime
// passport.serializeUser(User.serializeUser());
// passport.deserializeUser(User.deserializeUser());
//! this was from passport.js always work (for local and Oauth both)
passport.serializeUser(function (user, done) {
  done(null, user._id);
});

passport.deserializeUser(function (id, done) {
  User.findById(id, function (err, user) {
    done(err, user);
  });
});


//! google auto 2.O
passport.use(new GoogleStrategy(
  {
    clientID: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    callbackURL: "https://secrets-deployed1.vercel.app/auth/google/secrets",
    // callbackURL: "http://localhost:3000/auth/google/secrets",
    userProfileURL: "https://www.googleapis.com/oauth2/v3/userinfo"
  },
  function (accessToken, refreshToken, profile, cb) {
    console.log(profile);
    User.findOrCreate(
      {
        googleId: profile.id,
        username: profile.id,
        name: profile.displayName,
      },
      function (err, user) {
        return cb(err, user);
      });
  }
));

//! facebook auth
passport.use(new FacebookStrategy({
  clientID: process.env.FACEBOOK_APP_ID,
  clientSecret: process.env.FACEBOOK_APP_SECRET,
  callbackURL: "https://secrets-deployed1.vercel.app/auth/facebook/secrets",
  // callbackURL: "http://localhost:3000/auth/facebook/secrets",
  profileFields: ['id', 'displayName', 'photos', 'email']
},
  function (accessToken, refreshToken, profile, cb) {
    User.findOrCreate({ facebookId: profile.id, username: profile.id, name: profile.displayName }, function (err, user) {
      return cb(err, user);
    });
  }
));

//! Amazon Strategy
passport.use(new AmazonStrategy({
  clientID: process.env.AMAZON_CLIENT_ID,
  clientSecret: process.env.AMAZON_CLIENT_SECRET,
  callbackURL: "https://secrets-deployed1.vercel.app/auth/amazon/secrets"
},
  function (accessToken, refreshToken, profile, done) {
    User.findOrCreate({ amazonId: profile.id, username: profile.id }, function (err, user) {
      return done(err, user);
    });
  }
));

//! app.get() for home, login,register
app.get("/", function (req, res) {
  res.render("home");
});

app.get("/login", function (req, res) {
  res.render("login");
});

app.get("/register", function (req, res) {
  res.render("register");
});

//! google
app.route('/auth/google')
  .get(passport.authenticate('google', {
    scope: ['profile']
  }));

app.get("/auth/google/secrets",
  passport.authenticate('google', { failureRedirect: "/login" }),
  function (req, res) {
    res.redirect('/secrets');
  });

//! facebook
app.get('/auth/facebook',
  passport.authenticate('facebook'));

app.get('/auth/facebook/secrets',
  passport.authenticate('facebook', { failureRedirect: '/login' }),
  function (req, res) {
    // Successful authentication, redirect home.
    res.redirect('/secrets');
  });

//! amazon 
app.get('/auth/amazon',
  passport.authenticate('amazon'));

app.get('/auth/amazon/secrets',
  passport.authenticate('amazon', { failureRedirect: '/login' }),
  function (req, res) {
    // Successful authentication, redirect home.
    res.redirect('/secrets');
  });

app.get("/secrets", function (req, res) {
  let isAuthenticated = true;
  if (req.isAuthenticated()) {
    isAuthenticated = true;
  } else {
    isAuthenticated = false;
  }
  User.find({ secret: { $exists: true } }, function (err, foundUsers) {
    if (err) {
      console.log(err);
      res.send(err);
    }
    else {
      if (foundUsers) {
        res.render("secrets", { users: foundUsers, isAuthenticated: isAuthenticated });
      }
      else {
        res.render("secrets", { isAuthenticated: isAuthenticated });
      }
    }
  });
});
app.get("/submit", function (req, res) {
  if (req.isAuthenticated()) {
    res.render("submit");
  } else {
    res.redirect("/login");
  }
});

//* submitting secret
app.post("/submit", function (req, res) {
  const submittedSecret = req.body.secret;
  User.findById(req.user.id, function (err, foundUser) {
    if (err) {
      console.log(err);
      res.send(err);
    }
    else {
      if (foundUser) {
        foundUser.secret.push(submittedSecret);
        console.log(foundUser);
        foundUser.save(err, function () {
          res.redirect("/secrets");
        });
      }
      else {
        console.log("User not found!");
        res.redirect("/");
      }
    }
  });
});

//$ logout
app.get("/logout", function (req, res) {
  req.logout;
  req.session.destroy((err) => res.redirect('/'));
});

// app.post for register, login
app.post("/register", function (req, res) {
  // passport-local-mongoose methods
  const filled = req.body;
  let newUser = new User(
    {
      email: filled.username,
      username: filled.username,
      name: "email_login_user"
    }
  );

  User.register(
    newUser,
    filled.password,
    function (err, user) {
      if (err) {
        console.log(err);
        console.log("I'm unaunthenticated");
        res.redirect("/register");
      } else {
        console.log(passport);
        passport.authenticate("local")(req, res, function () {
          console.log("I'm aunthenticated");
          res.redirect("/secrets");
        });
      }
    }
  );
});

app.post("/login", function (req, res) {
  const user = User({
    username: req.body.username,
    password: req.body.password,
  });
  //!passport method
  req.login(user, function (err) {
    if (err) {
      console.log(err);
    }
    else {
      passport.authenticate("local")(req, res, function () {
        res.redirect("/secrets");
      })
    }
  });
});

//! app.listen() for both localhost:3000 and heroku server
let port = process.env.PORT;
if (port == null || port == "") {
  port = 3000;
}
app.listen(port, function () {
  console.log("Server started succesfully");
});