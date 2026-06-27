const express = require('express');
const mongoose = require('mongoose');
const dotenv = require('dotenv');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

dotenv.config();
const app = express();

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// 🗄️ เชื่อมต่อ MongoDB
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/smartbell')
  .then(() => console.log('✅ เชื่อมต่อ MongoDB สำเร็จพร้อมลุย!'))
  .catch(err => console.error('❌ เชื่อมต่อ MongoDB พลาด:', err));

// 📝 แบบแปลนข้อมูล (Schema)
const scheduleSchema = new mongoose.Schema({
  time: String,
  title: String,
  audio: String,
  activeDays: [Number], 
  isActive: { type: Boolean, default: true }
});
const Schedule = mongoose.model('Schedule', scheduleSchema);

// ================= 🔌 ระบบ Socket.io Real-time =================
io.on('connection', (socket) => {
  console.log(`⚡ มีอุปกรณ์เชื่อมต่อเข้ามา: ${socket.id}`);

  // รับคำสั่งแมนนวลจากหน้าเว็บแล้วส่งกระจายไปให้แอป Flutter ปลายทาง
  socket.on('force_play_bell', (audioFile) => {
    console.log(`🔔 สั่งเล่นเสียงด่วนจากหน้าเว็บ: ${audioFile}`);
    io.emit('play_bell_now', { audio: audioFile }); 
  });

  socket.on('force_stop_bell', () => {
    console.log(`🛑 สั่งหยุดเสียงฉุกเฉิน!`);
    io.emit('stop_bell_now'); 
  });

  socket.on('disconnect', () => {
    console.log(`🔴 อุปกรณ์ยกเลิกการเชื่อมต่อ: ${socket.id}`);
  });
});

// ================= 🚀 API ROUTES =================

// 🔐 ระบบเข้าสู่ระบบ (Login)
const ADMIN_USER = 'admin';
const ADMIN_PASS = '12345678'; // รหัสผ่านค่าเริ่มต้น

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  
  if (username === ADMIN_USER && password === ADMIN_PASS) {
    res.json({ success: true, message: 'เข้าสู่ระบบสำเร็จ' });
  } else {
    res.status(401).json({ success: false, message: 'ชื่อผู้ใช้งานหรือรหัสผ่านไม่ถูกต้อง' });
  }
});

// ดึงข้อมูล
app.get('/api/schedules', async (req, res) => {
  try {
    const schedules = await Schedule.find().sort({ time: 1 });
    res.json(schedules); 
  } catch (error) {
    res.status(500).json({ error: 'ดึงข้อมูลไม่สำเร็จ' });
  }
});

// เพิ่มข้อมูล
app.post('/api/schedules', async (req, res) => {
  try {
    const newSchedule = new Schedule(req.body);
    await newSchedule.save();
    io.emit('schedule_updated'); 
    res.status(201).json({ message: 'บันทึกสำเร็จ!', schedule: newSchedule });
  } catch (error) {
    res.status(500).json({ error: 'บันทึกไม่สำเร็จ' });
  }
});

// สลับสถานะเปิด-ปิด
app.put('/api/schedules/:id/toggle', async (req, res) => {
  try {
    const schedule = await Schedule.findById(req.params.id);
    schedule.isActive = !schedule.isActive; 
    await schedule.save();
    io.emit('schedule_updated'); 
    res.json({ message: 'อัปเดตสถานะสำเร็จ', isActive: schedule.isActive });
  } catch (error) {
    res.status(500).json({ error: 'อัปเดตสถานะไม่สำเร็จ' });
  }
});

// ลบข้อมูล
app.delete('/api/schedules/:id', async (req, res) => {
  try {
    await Schedule.findByIdAndDelete(req.params.id);
    io.emit('schedule_updated'); 
    res.json({ message: 'ลบข้อมูลสำเร็จ' });
  } catch (error) {
    res.status(500).json({ error: 'ลบข้อมูลไม่สำเร็จ' });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🚀 ระบบศูนย์ควบคุมรันอยู่ที่ http://localhost:${PORT}`);
});