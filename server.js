const express = require('express');
const app = express();
const { pool } = require('./dbConfig');
const bcrypt = require('bcrypt');
const session = require('express-session');
const flash = require('express-flash');
const passport = require('passport');


const initializePassport = require('./passportConfig');
const initialize = require('./passportConfig');
const { read } = require('fs');
const { networkInterfaces } = require('os');

initializePassport(passport);

const PORT = process.env.PORT || 5000;

app.set('view engine', 'ejs');
app.use(express.urlencoded({extended:false}));

app.use(
    session({
        secret: 'secret',
        resave: false,
        saveUninitialized: false
    })
);
app.use(passport.initialize());
app.use(passport.session());

app.use(flash());
   

app.get('/', (req, res) => {
    res.render('index');
});
app.get('/users/register', checkAuthenticated, (req, res) => {
    res.render("register");
});
app.get('/users/login',checkAuthenticated, (req, res) => {
    res.render("login");
});
app.get('/users/dashboard', checkNotAuthenticated, (req, res) => {
    // res.sendFile(__dirname + '/public/index.html');
    res.render("dashboard", {user: req.user.name});
    
});
app.get('/chat', function(req, res){
    res.sendFile(__dirname + '/public/index.html');
  });
  
app.get('/users/logout', (req,res)=> {
    req.logOut();
    req.flash("success_msg", "You have logged out");
    res.redirect('/users/login');
})
app.post('/users/register', async (req, res) => {
    let {name, email, password, password2} = req.body;
    console.log({
        name,
        email,
        password,
        password2
    }); 

    let errors = [];

    if(!name || !email || !password || !password2) {
        errors.push({message: "Please enter all fields"});
    }
    if(password.length < 6){
        errors.push({message: "Password should be at least 6 characters."});
    }
    if(password != password2){
        errors.push({message: "Passwords do not match"});
    }

    if(errors.length > 0 ){
        res.render('register', {errors});
    } else {
        //form validation has passed
        let hashedPassword = await bcrypt.hash(password, 10);
        console.log(hashedPassword);

        pool.query(
            `SELECT * FROM users
            WHERE email = $1`, 
            [email], 
            (err, results) => {
                if (err) {
                    throw err;
                }
                console.log(results.rows);

                if(results.rows.length > 0) {
                    errors.push({message: "Email already registered"});
                    res.render('register', {errors});
                }else{
                    pool.query(
                        `INSERT INTO users (name, email, password)
                        VALUES ($1, $2, $3)
                        RETURNING id, password`, [name, email, hashedPassword], 
                        (err, results) => {
                            if (err){
                                throw err;
                            }
                            console.log(results.rows);
                            req.flash('success_msg', "You are now registered. Please log in");
                            res.redirect('/users/login');
                        }
                    )
                }
            } 
        );
    }
});

app.post('/users/login', passport.authenticate('local', {
    successRedirect: '/users/dashboard',
    failureRedirect: '/users/login',
    failureFlash: true

}));
function checkAuthenticated(req, res, next){
    if(req.isAuthenticated()){
        return res.redirect('/users/dashboard');
    }
    next();
}
function checkNotAuthenticated(req, res, next){
    if(req.isAuthenticated()){
        return next()
    }
   res.redirect('/users/login'); 
}

const botName = 'TechChat Bot';

// Run when user connects
io.on('connection', socket => {
    socket.on('joinRoom', ({ username, room }) => {
      const user = userJoin(socket.id, username, room);
  
      socket.join(user.room);
  
      // Welcome current user
      socket.emit('message', formatMessage(botName, 'Welcome to TechChat!'));
  
      // Broadcast when a user connects
      socket.broadcast
        .to(user.room)
        .emit(
          'message',
          formatMessage(botName, `${user.username} has joined the chat`)
        );
  
      // Send users and room info
      io.to(user.room).emit('roomUsers', {
        room: user.room,
        users: getRoomUsers(user.room)
      });
    });
  
    // Listen for chatMessage
    socket.on('chatMessage', msg => {
      const user = getCurrentUser(socket.id);
  
      io.to(user.room).emit('message', formatMessage(user.username, msg));
    });
  
    // Runs when user disconnects
    socket.on('disconnect', () => {
      const user = userLeave(socket.id);
  
      if (user) {
        io.to(user.room).emit(
          'message',
          formatMessage(botName, `${user.username} has left the chat`)
        );
  
        // Send users and room info
        io.to(user.room).emit('roomUsers', {
          room: user.room,
          users: getRoomUsers(user.room)
        });
      }
    });
  });
  

app.listen(PORT, ()=> {
    console.log(`Server is running on port ${PORT}.`)
});