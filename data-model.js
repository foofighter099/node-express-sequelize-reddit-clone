// This file is ONLY meant as an example "structure"

// Dependencies
var express = require('express');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var Sequelize = require('sequelize');
var bcrypt = require('bcrypt');

var db = new Sequelize('reddit_clone', 'foofighter0991', undefined, {
    dialect: 'mysql'
});
var secureRandom = require('secure-random');
var app = express();
// Middleware
app.use(bodyParser.urlencoded({
    extended: false
}));
app.use(cookieParser());
//app.use(checkLogin);
app.use(checkLoginToken);

function createSessionToken() {
    return secureRandom.randomArray(40).map(code => code.toString(16)).join('');
}

/*function checkLogin(req, res, next) {
    User.findOne({
        where: {
            username: req.body.username
        }

    }).then(function(user) {
        req.currUser = user;
        next();
    });
}
*/
function checkLoginToken(request, response, next) {
    if (request.cookies.SESSION) {
        Session.findOne({
            where: {
                token: request.cookies.SESSION
            },
            include: User // so we can add it to the request
        }).then(
            function(session) {
                // session will be null if no token was found
                if (session) {
                    request.loggedInUser = session.user;
                }

                // No matter what, we call `next()` to move on to the next handler
                next();
            }
        );
    }
}

var User = db.define('user', {
    username: {
        type: Sequelize.STRING,
        unique: true
    },
    hashed_password: {
        type: Sequelize.STRING
    },
    password: {
        validate: {
            len: [5, 25]
        },
        type: Sequelize.VIRTUAL,
        set: function(actualPassword) {
            this.setDataValue('hashed_password', bcrypt.hashSync(actualPassword, 10));
            this.setDataValue("password", actualPassword);
        }
    }
});

// Even though the content belongs to users, we will setup the userId relationship later
var Content = db.define('content', {
    url: Sequelize.STRING,
    title: Sequelize.STRING
});

// Even though a vote has a link to user and content, we will setup the relationship later
var Vote = db.define('vote', {
    upVote: Sequelize.BOOLEAN
});

var Session = db.define('session', {
    token: Sequelize.STRING
});
User.hasMany(Session); // This will let us do user.createSession
Session.belongsTo(User); // This will let us do Session.findOne({include: User})

// User <-> Content relationship
User.hasMany(Content); // This will add an `addContent` function on user objects
// IF i also need to associate content to users in that direction, I can add this relation. If not, I can remove it
Content.belongsTo(User); // This will add a `setUser` function on content objects
// Content <-> Vote relationship
Content.hasMany(Vote);
// User <-> Vote <-> Content relationship
Content.belongsToMany(User, {
    through: Vote,
    as: 'Votes'
}); // This will add an `addVote` function on content objects
// IF I also need to associate users to a vote in that direction, I can add this relation. If not, I can remove it.
User.belongsToMany(Content, {
    through: Vote,
    as: 'Votes'
}); // This will add an `addVote` function on user objects

db.sync(); // Only needs to be used once!

// To Create Content:

app.get('/createContent', function(req, res, next) {
    if (!req.loggedInUser) {
        res.status(401).send('You must be logged in to create content!');
    }
    else {
        res.sendFile(__dirname + '/post-form.html');
    }
});
app.post('/createContent', function(req, res) {
    req.loggedInUser.createContent({
        url: req.body.url,
        title: req.body.title
    }).then(function(NewContent) {
        res.redirect("/contents");
    });
});

app.get('/contents', function(request, response, next) {
    Content.findAll({
        limit: 25,
        include: User,
        order: [
            ['createdAt', 'DESC']
        ]
    }).then(function(returnedContent) {
        console.log(returnedContent);
        // console.log(JSON.stringify(returnedContent, 0, 4));
        var listLi = "";
        returnedContent.forEach(function(item) {
            listLi = listLi + "<li>Title: " + item.title + "<br>Url: " + item.url + "<br>User: " + item.user.username + "</li>";
        });
        var htmlCore = "<div><h1>List of Contents</h1><ul>" + listLi + "</ul></div>" + logOut;
        listLi.length > 0 ? response.send(htmlCore) : response.send("Check your Code!");
    });
});

// To Create User:

function createNewUser(username, password, callback) {
    User.create({
        username: username,
        password: password
            //This is a callback function
    }).then(function(user) {
        callback(user);
    });
}

// To Login User:

app.get('/login', function(req, res, next) {

    var form = '<form action="/login" method="post"><div><input type="text" name="username" placeholder="Enter your username"></div><div><input type="text" name="password" placeholder="Enter your password"></div><button type="submit">Log In!</button></form>';
    if (req.query.error) {
        form = form + req.query.error;
    }
    res.send(form);
});
app.post('/login', function(req, res) {
    User.findOne({
        where: {
            username: req.body.username
        }
    }).then(
        function(user) {
            if (!user) {
                res.redirect('/login?error=Username or Password is invalid! - Please try again!');
            }
            else {
                // Here we found a user, compare their password!
                var passwordOk = bcrypt.compareSync(req.body.password, user.hashed_password);

                if (passwordOk) {
                    // this is good, we can now "log in" the user
                    var token = createSessionToken();

                    user.createSession({
                        token: token
                    }).then(function(session) {
                        // Here we can set a cookie for the user!
                        res.cookie('SESSION', token);
                        res.redirect('/contents');
                    });
                }
                else {
                    res.redirect('/login?error=Username or Password is invalid! - Please try again!');
                }
            }
        }
    );
});



// To Sign Up a User: 

app.get('/signup', function(req, res, next) {

    var form = '<form action="/signup" method="post"><div><input type="text" name="username" placeholder="Enter a username"></div><div><input type="text" name="password" placeholder="Enter your password"></div><button type="submit">Sign Up!</button></form>';
    if (req.query.error) {
        form = form + req.query.error;
    }
    res.send(form);

});


app.post('/signup', function(req, res) {
    User.create({
        username: req.body.username,
        password: req.body.password
            //This is a callback function
    }).then(function(user) {
        res.send("OK");
    }, function(err) {
        res.redirect('/signup?error=Username already exists or Password is invalid! - Please try again!');
    });
});

//To log out
var logOut = "<form action='/logout' method='post'><input type='hidden' name='logOut' value='true'></input><button type='submit'>Log out!</button></form>";

app.get('/logout', function(req, res) {
    if (req.query.error) {
        logOut = logOut + req.query.error;
    }
    res.send(logOut);
});

app.post('/logout', function(req, res) {
    Session.findOne({
        where: {
            token: req.cookies.SESSION
        },
        include: User // so we can add it to the request
    }).then(
        function(session) {
            // session will be null if no token was found
            if (session) {
                session.destroy()
                    .then(function() {
                        res.redirect('/login');
                    });

            }

        });
});
db.sync().then(function() {
    app.listen(process.env.PORT);
})