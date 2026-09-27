require('dotenv').config({ path: __dirname + '/.env' });

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

const PORT = process.env.PORT || 5000;
const bloodCompatibility = {
  'O-': ['O-'],
  'O+': ['O-', 'O+'],
  'A-': ['O-', 'A-'],
  'A+': ['O-', 'O+', 'A-', 'A+'],
  'B-': ['O-', 'B-'],
  'B+': ['O-', 'O+', 'B-', 'B+'],
  'AB-': ['O-', 'A-', 'B-', 'AB-'],
  'AB+': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+']
};

const urgencyWeight = { Low: 1, Medium: 2, Critical: 3 };

const seedDonors = [
  { donorName: 'Aarav Sharma', bloodType: 'O-', location: 'Mumbai', availability: 'Available', phone: '9876543210' },
  { donorName: 'Diya Nair', bloodType: 'A+', location: 'Bangalore', availability: 'Available', phone: '9812345678' },
  { donorName: 'Vivaan Patel', bloodType: 'B+', location: 'Delhi', availability: 'Available', phone: '9898765432' },
  { donorName: 'Meera Joshi', bloodType: 'AB+', location: 'Pune', availability: 'Busy', phone: '9988776655' },
  { donorName: 'Rohan Mishra', bloodType: 'O+', location: 'Hyderabad', availability: 'Available', phone: '9765432180' },
  { donorName: 'Ananya Nair', bloodType: 'A-', location: 'Chennai', availability: 'Available', phone: '9654321987' },
  { donorName: 'Karan Singh', bloodType: 'B-', location: 'Jaipur', availability: 'Available', phone: '9834567891' },
  { donorName: 'Saanvi Choudhary', bloodType: 'AB-', location: 'Kolkata', availability: 'Available', phone: '9900123456' },
  { donorName: 'Pranav Desai', bloodType: 'O+', location: 'Ahmedabad', availability: 'Available', phone: '9876001234' },
  { donorName: 'Ishita Sen', bloodType: 'A+', location: 'Lucknow', availability: 'Available', phone: '9987654321' }
];

const seedRequests = [
  { patientName: 'Aditi Verma', bloodType: 'O+', urgency: 'Critical', location: 'Mumbai', address: 'Kurla, Mumbai', contact: '9000012345', liveLocation: '19.0760, 72.8777' },
  { patientName: 'Kabir Reddy', bloodType: 'AB+', urgency: 'Medium', location: 'Hyderabad', address: 'Gachibowli, Hyderabad', contact: '9000123456', liveLocation: '17.3850, 78.4867' },
  { patientName: 'Pooja Shah', bloodType: 'B-', urgency: 'Critical', location: 'Delhi', address: 'Dwarka, Delhi', contact: '9000234567', liveLocation: '28.6139, 77.2090' }
];

let memoryMode = false;
let runtimeDonors = [...seedDonors];
let runtimeRequests = [...seedRequests];

app.use(cors());
app.use(express.json());

const donorSchema = new mongoose.Schema({
  donorName: String,
  bloodType: String,
  location: String,
  availability: { type: String, default: 'Available' },
  phone: String,
  createdAt: { type: Date, default: Date.now }
});

const requestSchema = new mongoose.Schema({
  patientName: String,
  bloodType: String,
  urgency: { type: String, enum: ['Low', 'Medium', 'Critical'], default: 'Medium' },
  location: String,
  address: String,
  contact: String,
  liveLocation: String,
  status: { type: String, default: 'Pending' },
  createdAt: { type: Date, default: Date.now }
});

const Donor = mongoose.models.Donor || mongoose.model('Donor', donorSchema);
const BloodRequest = mongoose.models.BloodRequest || mongoose.model('BloodRequest', requestSchema);

async function connectDatabase() {
  const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/blood_donor_matching_app';

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 3000 });
    console.log('MongoDB connected successfully.');
    memoryMode = false;

    const donorCount = await Donor.countDocuments();
    const requestCount = await BloodRequest.countDocuments();

    if (donorCount === 0) {
      await Donor.insertMany(seedDonors);
    }

    if (requestCount === 0) {
      await BloodRequest.insertMany(seedRequests);
    }
  } catch (error) {
    console.log('MongoDB not available; using in-memory data for demo mode.');
    memoryMode = true;
    runtimeDonors = [...seedDonors];
    runtimeRequests = [...seedRequests];
  }
}

async function getAllDonors() {
  if (memoryMode) {
    return runtimeDonors;
  }

  return Donor.find().sort({ createdAt: -1 });
}

async function getAllRequests() {
  if (memoryMode) {
    return runtimeRequests;
  }

  return BloodRequest.find().sort({ createdAt: -1 });
}

async function addDonor(donorData) {
  if (memoryMode) {
    const donor = { _id: Date.now().toString(), ...donorData, createdAt: new Date() };
    runtimeDonors.unshift(donor);
    return donor;
  }

  const donor = new Donor(donorData);
  await donor.save();
  return donor;
}

async function addRequest(requestData) {
  if (memoryMode) {
    const request = { _id: Date.now().toString(), ...requestData, status: 'Pending', createdAt: new Date() };
    runtimeRequests.unshift(request);
    return request;
  }

  const request = new BloodRequest(requestData);
  await request.save();
  return request;
}

function calculateMatchScore(requestBloodType, donorBloodType, donorLocation, requestLocation, urgency) {
  const compatible = bloodCompatibility[requestBloodType] || [];
  const donorCompatible = compatible.includes(donorBloodType) ? 100 : 0;
  const locationBonus = donorLocation === requestLocation ? 30 : 0;
  const urgencyBonus = urgencyWeight[urgency] * 10;
  return donorCompatible + locationBonus + urgencyBonus;
}

async function buildMatches(requestData) {
  const donors = await getAllDonors();
  const requestBloodType = requestData.bloodType || 'O+';
  const requestLocation = requestData.location || 'Mumbai';
  const urgency = requestData.urgency || 'Critical';

  return donors
    .filter((donor) => donor.availability !== 'Unavailable')
    .map((donor) => ({
      ...donor,
      matchScore: calculateMatchScore(requestBloodType, donor.bloodType, donor.location, requestLocation, urgency)
    }))
    .sort((a, b) => b.matchScore - a.matchScore)
    .slice(0, 6);
}

app.get('/api/health', async (req, res) => {
  res.json({ status: 'ok', database: memoryMode ? 'in-memory' : 'mongodb' });
});

app.get('/api/donors', async (req, res) => {
  const donors = await getAllDonors();
  res.json(donors);
});

app.post('/api/donors', async (req, res) => {
  try {
    const donor = await addDonor(req.body);
    io.emit('new_donor', donor);
    res.status(201).json(donor);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/requests', async (req, res) => {
  const requests = await getAllRequests();
  res.json(requests);
});

app.post('/api/requests', async (req, res) => {
  try {
    const request = await addRequest(req.body);
    io.emit('new_request', request);
    const matches = await buildMatches(request);
    res.status(201).json({ ...request, matches });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.get('/api/matches', async (req, res) => {
  const requestData = {
    bloodType: req.query.bloodType || 'O+',
    location: req.query.location || 'Mumbai',
    urgency: req.query.urgency || 'Critical'
  };

  const matches = await buildMatches(requestData);
  res.json(matches);
});

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
});

connectDatabase().then(() => {
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
});
