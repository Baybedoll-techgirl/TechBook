  const path = require('path');
 
  //express server
  const express = require('express');
  const app = express();
  const http = require('http');
  const server = http.createServer(app);
  
  //socket.io
  const { Server } = require("socket.io");
  const io = new Server(server);
  const socketio = require('socket.io');
  const formatMessage = require('./utils/messages');
  const {
    userJoin,
    getCurrentUser,
    userLeave,
    getRoomUsers
  } = require('./utils/users');

//database
const { pool } = require('./dbConfig');  
const User = require("./utils/users");
  
  //authentication
  const bcrypt = require('bcrypt'); 
  const initializePassport = require('./passportConfig');
  const passport = require('passport');
  const flash = require('express-flash'); 
  const session = require('express-session'); 
  const methodOverride = require('method-override');
  initializePassport(
    passport,
    email => User.findOne({email: email}),
    id => User.findOne({id: id})
    )
  
  
  app.use(express.json());
  app.use(express.static(path.join(__dirname, 'public')));
  app.set('view-engine', 'ejs');
  app.use(express.urlencoded({ extended: false })); 
  app.use(flash())
  app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false, 
    saveUninitialized: false
  }))
  app.use(passport.initialize())
  app.use(passport.session()) 
  app.use(methodOverride('_method'))
  
  //Routes
  app.get('/', checkAuthenticated, (req, res) => {
    res.sendFile(__dirname + 'index.html')
  });
  
  app.get('/login', checkNotAuthenticated, (req, res) => {
    res.render('login.ejs')
  });
  
  app.post('/login', checkNotAuthenticated, passport.authenticate ('local', {
    successRedirect: '/',
    failureRedirect: '/login',
    failureFlash: true
  }));
    
  app.get('/register', checkNotAuthenticated, async (req, res) => {
    res.render('register.ejs');
  });
   
  app.get('/logout', (req, res) => {
    req.logOut();
    req.flash("success_msg", "You have logged out");
    res.redirect('/login');
    
  });
  app.post('/register', async (req, res) => {
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
                    res.render('register.ejs', {errors});
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
                            res.redirect('/login');
                        }
                    )
                      
                }
            } 
        );
    };
  });


  
  function checkAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
      return next()
    }
    res.redirect('/login')
  }
  function checkNotAuthenticated(req, res, next) {
    if (req.isAuthenticated()) {
      return res.redirect('/')
    }
    next()
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
  let port = process.env.PORT;
  if (port == null || port == "") {
    port = 3000;
  }
  
  server.listen(port, () => {
    console.log('Server has started successfully');
  });