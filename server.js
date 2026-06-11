require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const bcrypt = require('bcrypt'); 

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// ==========================================
// 1. เชื่อมต่อ MONGODB
// ==========================================
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('🟢 MongoDB Connected! ระบบฐานข้อมูลออนไลน์ทำงานแล้ว'))
  .catch(err => console.log('🔴 MongoDB Error:', err));

// ==========================================
// 2. โครงสร้างข้อมูล (SCHEMA) แบบแยกโรงเรียน
// ==========================================
const schoolSchema = new mongoose.Schema({
  schoolName: String,
  email: { type: String, unique: true },
  password: String
});
const School = mongoose.model('School', schoolSchema);

const scheduleSchema = new mongoose.Schema({
  schoolId: String, 
  time: String,
  title: String,
  audio: String,
  isActive: { type: Boolean, default: true }
});
const Schedule = mongoose.model('Schedule', scheduleSchema);

// ==========================================
// 3. API ระบบ ADMIN (ล็อกอิน / สมัคร)
// ==========================================
app.post('/api/auth/register', async (req, res) => {
  try {
    const { schoolName, email, password } = req.body;
    const existingSchool = await School.findOne({ email });
    if (existingSchool) return res.status(400).json({ message: 'อีเมลนี้ถูกใช้งานแล้ว!' });

    const hashedPassword = await bcrypt.hash(password, 10);
    const newSchool = new School({ schoolName, email, password: hashedPassword });
    await newSchool.save();
    
    res.status(201).json({ schoolId: newSchool._id, schoolName: newSchool.schoolName });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const school = await School.findOne({ email });
    if (!school) return res.status(400).json({ message: 'ไม่พบอีเมลนี้ในระบบ!' });

    const isMatch = await bcrypt.compare(password, school.password);
    if (!isMatch) return res.status(400).json({ message: 'รหัสผ่านไม่ถูกต้อง!' });

    res.json({ schoolId: school._id, schoolName: school.schoolName });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 4. API จัดการตาราง (แยกตามโรงเรียน)
// ==========================================
app.get('/api/schedules/:schoolId', async (req, res) => {
  try {
    const schedules = await Schedule.find({ schoolId: req.params.schoolId }).sort({ time: 1 });
    res.json(schedules);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/schedules', async (req, res) => {
  try {
    const newSchedule = new Schedule(req.body);
    await newSchedule.save();
    io.to(req.body.schoolId).emit('scheduleUpdated'); 
    res.status(201).json(newSchedule);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 🗑️ API สำหรับลบตารางออด
app.delete('/api/schedules/:id', async (req, res) => {
  try {
    const deletedSchedule = await Schedule.findByIdAndDelete(req.params.id);
    if (deletedSchedule) {
      // ⚡ สั่งให้แอปของโรงเรียนนั้นๆ รีเฟรชหน้าจอทันทีเมื่อมีคนกดลบ
      io.to(deletedSchedule.schoolId).emit('scheduleUpdated'); 
    }
    res.json({ message: 'ลบตารางเรียบร้อยแล้ว!' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ==========================================
// 5. ระบบ REAL-TIME (Multi-tenant Socket)
// ==========================================
io.on('connection', (socket) => {
  socket.on('joinSchool', (schoolId) => {
    socket.join(schoolId);
    console.log(`📱 อุปกรณ์เข้าร่วมห้องโรงเรียน: ${schoolId}`);
  });

  socket.on('toggleSystem', (data) => {
    io.to(data.schoolId).emit('systemStatusChanged', { isOnline: data.isOnline });
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`🚀 Server Running on Port ${PORT}`));