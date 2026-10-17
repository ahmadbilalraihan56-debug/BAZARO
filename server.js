require("dotenv").config?.();
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = Number(process.env.PORT || 3000);
const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || "admin@example.com").trim().toLowerCase();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || "ChangeThisPassword123!");
const SESSION_SECRET = process.env.SESSION_SECRET || "development-only-change-me";
const uploadDir = path.join(__dirname, "public", "uploads");
fs.mkdirSync(uploadDir, { recursive: true });

const db = new Database(path.join(__dirname, "bazaro.sqlite"));
db.pragma("journal_mode = WAL");
db.exec(`
CREATE TABLE IF NOT EXISTS users (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 name TEXT NOT NULL,
 email TEXT NOT NULL UNIQUE,
 password_hash TEXT NOT NULL,
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS products (
 id INTEGER PRIMARY KEY AUTOINCREMENT,
 user_id INTEGER NOT NULL REFERENCES users(id),
 title TEXT NOT NULL,
 description TEXT NOT NULL DEFAULT '',
 price REAL NOT NULL,
 currency TEXT NOT NULL DEFAULT 'USD',
 category TEXT NOT NULL,
 country TEXT NOT NULL,
 region TEXT NOT NULL DEFAULT '',
 city TEXT NOT NULL DEFAULT '',
 contact TEXT NOT NULL,
 image_path TEXT NOT NULL DEFAULT '',
 status TEXT NOT NULL DEFAULT 'pending',
 created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
 reviewed_at TEXT,
 rejection_note TEXT
);
CREATE INDEX IF NOT EXISTS idx_products_status ON products(status);
CREATE INDEX IF NOT EXISTS idx_products_country ON products(country);
`);
const adminExists = db.prepare("SELECT id FROM users WHERE email=?").get(ADMIN_EMAIL);
if (!adminExists) {
  const hash = bcrypt.hashSync(ADMIN_PASSWORD, 12);
  db.prepare("INSERT INTO users(name,email,password_hash) VALUES(?,?,?)").run("BAZARO Admin", ADMIN_EMAIL, hash);
}

app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));
app.use(session({
  store: new SQLiteStore({ db: "sessions.sqlite", dir: __dirname }),
  secret: SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

const countries = [
"Afghanistan","Albania","Algeria","Andorra","Angola","Argentina","Armenia","Australia","Austria","Azerbaijan",
"Bahamas","Bahrain","Bangladesh","Barbados","Belarus","Belgium","Belize","Benin","Bhutan","Bolivia","Bosnia and Herzegovina","Botswana","Brazil","Brunei","Bulgaria","Burkina Faso","Burundi",
"Cambodia","Cameroon","Canada","Chad","Chile","China","Colombia","Costa Rica","Croatia","Cuba","Cyprus","Czechia",
"Denmark","Djibouti","Dominican Republic","Ecuador","Egypt","El Salvador","Estonia","Ethiopia",
"Fiji","Finland","France","Georgia","Germany","Ghana","Greece","Guatemala","Honduras","Hungary","Iceland","India","Indonesia","Iran","Iraq","Ireland","Israel","Italy","Jamaica","Japan","Jordan","Kazakhstan","Kenya","Kuwait","Kyrgyzstan","Laos","Latvia","Lebanon","Libya","Lithuania","Luxembourg","Madagascar","Malawi","Malaysia","Maldives","Mali","Malta","Mauritania","Mauritius","Mexico","Moldova","Monaco","Mongolia","Montenegro","Morocco","Mozambique","Myanmar","Namibia","Nepal","Netherlands","New Zealand","Nicaragua","Niger","Nigeria","North Korea","North Macedonia","Norway","Oman","Pakistan","Palestine","Panama","Papua New Guinea","Paraguay","Peru","Philippines","Poland","Portugal","Qatar","Romania","Russia","Rwanda","Saudi Arabia","Senegal","Serbia","Sierra Leone","Singapore","Slovakia","Slovenia","Somalia","South Africa","South Korea","South Sudan","Spain","Sri Lanka","Sudan","Sweden","Switzerland","Syria","Taiwan","Tajikistan","Tanzania","Thailand","Togo","Trinidad and Tobago","Tunisia","Turkey","Turkmenistan","Uganda","Ukraine","United Arab Emirates","United Kingdom","United States","Uruguay","Uzbekistan","Venezuela","Vietnam","Yemen","Zambia","Zimbabwe"
];
const categories = ["All categories","Electronics","Phones & Tablets","Vehicles","Home & Furniture","Fashion","Beauty & Health","Food & Groceries","Construction","Property","Jobs","Professional Services","Sports & Outdoors","Toys & Kids","Books & Education","Agriculture","Industrial & Business","Other"];

function esc(s="") {
 return String(s).replace(/[&<>"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
}
function layout(title, content, req, extra="") {
 const user = req.session.user;
 return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="BAZARO — a global marketplace for products and services."><title>${esc(title)} | BAZARO</title><link rel="stylesheet" href="/style.css"></head><body>
 <header class="top"><a class="brand" href="/">BAZARO<span>.</span></a><nav><a href="/">Marketplace</a>${user ? '<a href="/sell">Sell an item</a><a href="/my-listings">My listings</a>' : ''}${user && user.email===ADMIN_EMAIL ? '<a href="/admin">Admin</a>' : ''}${user ? `<span class="hello">Hi, ${esc(user.name)}</span><form class="inline" method="post" action="/logout"><button class="navbutton">Log out</button></form>` : '<a href="/login">Log in</a><a class="navcta" href="/register">Create account</a>'}</nav></header>
 <main>${extra}${content}</main><footer><strong>BAZARO</strong> — Your world. Your marketplace. <span>Buy and sell locally or globally.</span></footer></body></html>`;
}
function page(title, content, req, extra="") { return layout(title, content, req, extra); }
function requireLogin(req,res,next){ if(!req.session.user) return res.redirect("/login"); next(); }
function requireAdmin(req,res,next){ if(!req.session.user || req.session.user.email!==ADMIN_EMAIL) return res.status(403).send(page("Access denied",'<section class="panel"><h1>Access denied</h1><p>Administrator access is required.</p></section>',req)); next(); }
function flash(req){ const m=req.session.flash; delete req.session.flash; return m ? `<div class="notice">${esc(m)}</div>` : ""; }
function countryOptions(selected="") { return countries.map(c=>`<option ${c===selected?"selected":""} value="${esc(c)}">${esc(c)}</option>`).join(""); }
function categoryOptions(selected="") { return categories.slice(1).map(c=>`<option ${c===selected?"selected":""} value="${esc(c)}">${esc(c)}</option>`).join(""); }
function money(price,currency){ try{return new Intl.NumberFormat("en-US",{style:"currency",currency}).format(price)}catch{return `${currency} ${price}`} }
function productCard(p) {
 const img = p.image_path ? `<img src="${esc(p.image_path)}" alt="${esc(p.title)}">` : `<div class="placeholder">BAZARO</div>`;
 return `<article class="product">${img}<div class="productbody"><span class="tag">${esc(p.category)}</span><h3>${esc(p.title)}</h3><p class="price">${esc(money(p.price,p.currency))}</p><p class="location">📍 ${esc([p.city,p.region,p.country].filter(Boolean).join(", "))}</p><p class="desc">${esc(p.description || "Contact the seller for more information.")}</p><a class="button small" href="/product/${p.id}">View details</a></div></article>`;
}

const storage = multer.diskStorage({
 destination: (_req,_file,cb)=>cb(null,uploadDir),
 filename: (_req,file,cb)=>cb(null,Date.now()+"-"+Math.random().toString(36).slice(2,10)+path.extname(file.originalname).toLowerCase())
});
const upload = multer({storage, limits:{fileSize:5*1024*1024}, fileFilter:(_req,file,cb)=>{
 const ok=["image/jpeg","image/png","image/webp","image/gif"].includes(file.mimetype);
 cb(ok?null:new Error("Please upload a JPG, PNG, WEBP or GIF image."),ok);
}});

app.get("/", (req,res)=>{
 const q=String(req.query.q||"").trim(), country=String(req.query.country||""), category=String(req.query.category||"");
 let sql="SELECT * FROM products WHERE status='approved'", args=[];
 if(q){sql+=" AND (title LIKE ? OR description LIKE ? OR city LIKE ? OR country LIKE ?)"; args.push(`%${q}%`,`%${q}%`,`%${q}%`,`%${q}%`);}
 if(country && countries.includes(country)){sql+=" AND country=?";args.push(country);}
 if(category && categories.includes(category) && category!=="All categories"){sql+=" AND category=?";args.push(category);}
 sql+=" ORDER BY created_at DESC LIMIT 60";
 const products=db.prepare(sql).all(...args);
 const content=`${flash(req)}<section class="hero"><div><p class="eyebrow">A WORLD OF OPPORTUNITY</p><h1>Discover more.<br><em>Sell anywhere.</em></h1><p>Explore products and services from sellers around the world.</p><a class="button" href="${req.session.user?"/sell":"/register"}">Start selling free</a></div><div class="hero-art"><div class="globe">🌐</div><div class="float-card">🌍 Global reach</div><div class="float-card second">🛍️ Local finds</div></div></section>
 <section class="section"><div class="sectionhead"><div><p class="eyebrow">THE MARKETPLACE</p><h2>Find what you need</h2></div><span class="muted">${products.length} listing${products.length===1?"":"s"}</span></div>
 <form class="searchbar" method="get" action="/"><input name="q" value="${esc(q)}" placeholder="Search products, services, cities..." aria-label="Search"><select name="country"><option value="">All countries</option>${countries.map(c=>`<option ${country===c?"selected":""} value="${esc(c)}">${esc(c)}</option>`).join("")}</select><select name="category"><option value="">All categories</option>${categoryOptions(category)}</select><button class="button">Search</button></form>
 ${products.length?`<div class="grid">${products.map(productCard).join("")}</div>`:`<div class="empty"><div>🛍️</div><h3>No approved listings yet</h3><p>Be one of the first sellers on BAZARO. New products appear after admin approval.</p><a class="button" href="${req.session.user?"/sell":"/register"}">List a product</a></div>`}</section>`;
 res.send(page("Global Marketplace",content,req));
});

app.get("/register",(req,res)=>res.send(page("Create account",`${flash(req)}<section class="formpanel"><p class="eyebrow">JOIN BAZARO</p><h1>Create your account</h1><p class="muted">Create an account to list products and manage your listings.</p><form method="post" action="/register" class="stack"><label>Full name<input name="name" required maxlength="80" autocomplete="name"></label><label>Email address<input type="email" name="email" required maxlength="180" autocomplete="email"></label><label>Password<input type="password" name="password" required minlength="10" autocomplete="new-password"><small>Use at least 10 characters.</small></label><button class="button">Create account</button></form><p>Already registered? <a href="/login">Log in</a></p></section>`,req)));
app.post("/register",(req,res)=>{
 const name=String(req.body.name||"").trim(),email=String(req.body.email||"").trim().toLowerCase(),password=String(req.body.password||"");
 if(name.length<2||!email.includes("@")||password.length<10){req.session.flash="Please provide a valid name/email and a password of at least 10 characters.";return res.redirect("/register");}
 try{const hash=bcrypt.hashSync(password,12);const info=db.prepare("INSERT INTO users(name,email,password_hash) VALUES(?,?,?)").run(name,email,hash);req.session.user={id:Number(info.lastInsertRowid),name,email};res.redirect("/sell");}
 catch{req.session.flash="That email may already be registered. Try logging in.";res.redirect("/register");}
});
app.get("/login",(req,res)=>res.send(page("Log in",`${flash(req)}<section class="formpanel"><p class="eyebrow">WELCOME BACK</p><h1>Log in to BAZARO</h1><form method="post" action="/login" class="stack"><label>Email address<input type="email" name="email" required autocomplete="email"></label><label>Password<input type="password" name="password" required autocomplete="current-password"></label><button class="button">Log in</button></form><p>New to BAZARO? <a href="/register">Create an account</a></p></section>`,req)));
app.post("/login",(req,res)=>{
 const email=String(req.body.email||"").trim().toLowerCase(), password=String(req.body.password||"");
 const u=db.prepare("SELECT * FROM users WHERE email=?").get(email);
 if(!u||!bcrypt.compareSync(password,u.password_hash)){req.session.flash="Incorrect email or password.";return res.redirect("/login");}
 req.session.user={id:u.id,name:u.name,email:u.email};res.redirect(email===ADMIN_EMAIL?"/admin":"/");
});
app.post("/logout",(req,res)=>req.session.destroy(()=>res.redirect("/")));

app.get("/sell",requireLogin,(req,res)=>res.send(page("List a product",`${flash(req)}<section class="formpanel wide"><p class="eyebrow">SELL ON BAZARO</p><h1>List a product or service</h1><p class="muted">Your listing will be reviewed by a BAZARO administrator before it appears publicly.</p><form method="post" action="/sell" enctype="multipart/form-data" class="stack"><div class="formgrid"><label>Product or service name<input name="title" required maxlength="120" placeholder="e.g. Samsung Galaxy phone"></label><label>Category<select name="category" required><option value="">Choose a category</option>${categoryOptions()}</select></label><label>Price<input type="number" name="price" min="0" step="0.01" required placeholder="0.00"></label><label>Currency<select name="currency" required>${["USD","EUR","GBP","AFN","PKR","INR","AED","SAR","CAD","AUD","TRY","CNY","JPY"].map(c=>`<option value="${c}" ${c==="USD"?"selected":""}>${c}</option>`).join("")}</select></label><label>Country<select name="country" required><option value="">Choose a country</option>${countryOptions()}</select></label><label>State / Province / Region<input name="region" maxlength="100" placeholder="e.g. Kabul Province"></label><label>City<input name="city" maxlength="100" placeholder="e.g. Kabul"></label><label>Contact phone or WhatsApp<input name="contact" required maxlength="80" placeholder="+1 555 0100"></label></div><label>Description<textarea name="description" maxlength="3000" rows="5" placeholder="Describe condition, features, delivery or service details..."></textarea></label><label>Product image (optional, JPG/PNG/WEBP/GIF, max 5 MB)<input type="file" name="image" accept="image/jpeg,image/png,image/webp,image/gif"></label><button class="button">Submit for review</button></form></section>`,req)));
app.post("/sell",requireLogin,(req,res)=>upload.single("image")(req,res,err=>{
 if(err){req.session.flash=err.message||"Image upload failed.";return res.redirect("/sell");}
 const title=String(req.body.title||"").trim(), category=String(req.body.category||""), country=String(req.body.country||""), contact=String(req.body.contact||"").trim(), price=Number(req.body.price), currency=String(req.body.currency||"USD");
 if(!title||title.length>120||!categories.includes(category)||category==="All categories"||!countries.includes(country)||!contact||!Number.isFinite(price)||price<0||!["USD","EUR","GBP","AFN","PKR","INR","AED","SAR","CAD","AUD","TRY","CNY","JPY"].includes(currency)){
  req.session.flash="Please check the required fields and try again.";return res.redirect("/sell");
 }
 const imagePath=req.file?"/uploads/"+req.file.filename:"";
 db.prepare("INSERT INTO products(user_id,title,description,price,currency,category,country,region,city,contact,image_path,status) VALUES(?,?,?,?,?,?,?,?,?,?,?,'pending')")
 .run(req.session.user.id,title,String(req.body.description||"").trim(),price,currency,category,country,String(req.body.region||"").trim(),String(req.body.city||"").trim(),contact,imagePath);
 req.session.flash="Your listing was submitted and is waiting for administrator approval.";
 res.redirect("/my-listings");
}));
app.get("/my-listings",requireLogin,(req,res)=>{
 const products=db.prepare("SELECT * FROM products WHERE user_id=? ORDER BY created_at DESC").all(req.session.user.id);
 const rows=products.map(p=>`<tr><td>${esc(p.title)}</td><td>${esc(money(p.price,p.currency))}</td><td><span class="status ${p.status}">${esc(p.status)}</span>${p.rejection_note?`<small>${esc(p.rejection_note)}</small>`:""}</td><td>${esc(p.created_at)}</td></tr>`).join("");
 res.send(page("My listings",`${flash(req)}<section class="section"><div class="sectionhead"><div><p class="eyebrow">SELLER CENTER</p><h1>My listings</h1></div><a class="button" href="/sell">Add product</a></div>${products.length?`<div class="tablewrap"><table><thead><tr><th>Listing</th><th>Price</th><th>Status</th><th>Submitted</th></tr></thead><tbody>${rows}</tbody></table></div>`:`<div class="empty"><h3>No listings yet</h3><p>Add a product to get started.</p><a class="button" href="/sell">List a product</a></div>`}</section>`,req));
});
app.get("/product/:id",(req,res)=>{
 const p=db.prepare("SELECT p.*,u.name AS seller_name FROM products p JOIN users u ON u.id=p.user_id WHERE p.id=? AND p.status='approved'").get(Number(req.params.id));
 if(!p)return res.status(404).send(page("Listing not found",'<section class="panel"><h1>Listing not found</h1><p>This product may still be under review or may have been removed.</p><a href="/">Back to marketplace</a></section>',req));
 const image=p.image_path?`<img class="detailimage" src="${esc(p.image_path)}" alt="${esc(p.title)}">`:`<div class="detailplaceholder">BAZARO</div>`;
 const content=`<section class="detail">${image}<div><span class="tag">${esc(p.category)}</span><h1>${esc(p.title)}</h1><p class="price big">${esc(money(p.price,p.currency))}</p><p class="location">📍 ${esc([p.city,p.region,p.country].filter(Boolean).join(", "))}</p><p>${esc(p.description||"Contact the seller for more information.")}</p><hr><p><strong>Seller:</strong> ${esc(p.seller_name)}</p><p><strong>Contact:</strong> ${esc(p.contact)}</p><a class="button" target="_blank" rel="noopener noreferrer" href="https://wa.me/${esc(p.contact.replace(/[^0-9]/g,""))}">Contact on WhatsApp</a><p class="muted smalltext">Always verify the item and seller before paying. BAZARO does not hold or guarantee transactions.</p></div></section>`;
 res.send(page(p.title,content,req));
});
app.get("/admin",requireAdmin,(req,res)=>{
 const pending=db.prepare("SELECT p.*,u.name AS seller_name,u.email AS seller_email FROM products p JOIN users u ON u.id=p.user_id WHERE p.status='pending' ORDER BY p.created_at ASC").all();
 const stats=db.prepare("SELECT status,COUNT(*) AS n FROM products GROUP BY status").all();
 const cards=pending.map(p=>`<article class="reviewcard">${p.image_path?`<img src="${esc(p.image_path)}" alt="${esc(p.title)}">`:`<div class="placeholder">BAZARO</div>`}<div class="reviewbody"><div class="sectionhead"><h3>${esc(p.title)}</h3><span class="status pending">pending</span></div><p class="price">${esc(money(p.price,p.currency))}</p><p><strong>Category:</strong> ${esc(p.category)} · <strong>Location:</strong> ${esc([p.city,p.region,p.country].filter(Boolean).join(", "))}</p><p>${esc(p.description)}</p><p><strong>Seller:</strong> ${esc(p.seller_name)} (${esc(p.seller_email)}) · <strong>Contact:</strong> ${esc(p.contact)}</p><div class="reviewactions"><form method="post" action="/admin/review/${p.id}"><input type="hidden" name="decision" value="approved"><button class="button">Approve listing</button></form><form method="post" action="/admin/review/${p.id}" class="rejectform"><input type="hidden" name="decision" value="rejected"><input name="note" placeholder="Reason (optional)" maxlength="300"><button class="button danger">Reject</button></form></div></div></article>`).join("");
 res.send(page("Admin moderation",`${flash(req)}<section class="section"><p class="eyebrow">CONTROL CENTER</p><h1>Admin moderation</h1><div class="stats">${["pending","approved","rejected"].map(s=>`<div class="stat"><span>${s}</span><strong>${(stats.find(x=>x.status===s)||{n:0}).n}</strong></div>`).join("")}</div><h2>Listings waiting for review (${pending.length})</h2>${pending.length?`<div class="reviews">${cards}</div>`:`<div class="empty"><h3>You're all caught up</h3><p>No products are waiting for review.</p></div>`}</section>`,req));
});
app.post("/admin/review/:id",requireAdmin,(req,res)=>{
 const id=Number(req.params.id), decision=String(req.body.decision||"");
 if(!["approved","rejected"].includes(decision)){req.session.flash="Invalid review action.";return res.redirect("/admin");}
 const p=db.prepare("SELECT id FROM products WHERE id=? AND status='pending'").get(id);
 if(!p){req.session.flash="This listing was already reviewed or does not exist.";return res.redirect("/admin");}
 db.prepare("UPDATE products SET status=?,reviewed_at=CURRENT_TIMESTAMP,rejection_note=? WHERE id=?").run(decision,decision==="rejected"?String(req.body.note||"").slice(0,300):null,id);
 req.session.flash=`Listing ${decision}.`;res.redirect("/admin");
});
app.use((err,req,res,next)=>{
 console.error(err.message);
 res.status(500).send(page("Something went wrong",'<section class="panel"><h1>Something went wrong</h1><p>Please go back and check your details, then try again.</p><a href="/">Return to BAZARO</a></section>',req));
});
app.listen(PORT,()=>console.log(`BAZARO running on http://localhost:${PORT}`));
