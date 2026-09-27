import React, { useEffect, useMemo, useState } from 'react';
import { io } from 'socket.io-client';

const socket = io('http://localhost:5000');

const indianNames = [
  'Aarav Sharma', 'Vivaan Patel', 'Aditya Verma', 'Vihaan Iyer', 'Sai Reddy',
  'Ananya Nair', 'Diya Kapoor', 'Ishita Singh', 'Meera Joshi', 'Kavya Rao',
  'Rohan Mishra', 'Pranav Desai', 'Nisha Kulkarni', 'Tanya Gupta', 'Aditi Sen',
  'Yash Malhotra', 'Saanvi Choudhary', 'Rhea Shah', 'Arjun Menon', 'Sneha Banerjee'
];

const indianCities = ['Mumbai', 'Delhi', 'Bangalore', 'Hyderabad', 'Ahmedabad', 'Chennai', 'Kolkata', 'Pune', 'Jaipur', 'Lucknow'];
const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'];
const urgencyOrder = { Critical: 3, Medium: 2, Low: 1 };
const cityCoordinates = {
  Mumbai: { lat: 19.076, lng: 72.8777 },
  Delhi: { lat: 28.6139, lng: 77.209 },
  Bangalore: { lat: 12.9716, lng: 77.5946 },
  Hyderabad: { lat: 17.385, lng: 78.4867 },
  Ahmedabad: { lat: 23.0225, lng: 72.5714 },
  Chennai: { lat: 13.0827, lng: 80.2707 },
  Kolkata: { lat: 22.5726, lng: 88.3639 },
  Pune: { lat: 18.5204, lng: 73.8567 },
  Jaipur: { lat: 26.9124, lng: 75.7873 },
  Lucknow: { lat: 26.8467, lng: 80.9462 }
};

const compatibility = {
  'O-': ['O-'],
  'O+': ['O-', 'O+'],
  'A-': ['O-', 'A-'],
  'A+': ['O-', 'O+', 'A-', 'A+'],
  'B-': ['O-', 'B-'],
  'B+': ['O-', 'O+', 'B-', 'B+'],
  'AB-': ['O-', 'A-', 'B-', 'AB-'],
  'AB+': ['O-', 'O+', 'A-', 'A+', 'B-', 'B+', 'AB-', 'AB+']
};

const urgencyColors = {
  Low: '#10b981',
  Medium: '#f59e0b',
  Critical: '#ef4444'
};

const defaultRequest = {
  patientName: indianNames[0],
  bloodType: 'O+',
  urgency: 'Critical',
  location: 'Mumbai',
  address: 'Kurla, Mumbai',
  contact: '9876543210',
  liveLocation: ''
};

const defaultDonor = {
  donorName: indianNames[5],
  bloodType: 'B+',
  location: 'Delhi',
  availability: 'Available',
  phone: '9876501234'
};

function getNearestCity(latitude, longitude) {
  let nearestCity = 'Mumbai';
  let shortestDistance = Number.POSITIVE_INFINITY;

  Object.entries(cityCoordinates).forEach(([city, coords]) => {
    const distance = Math.sqrt(
      (latitude - coords.lat) ** 2 +
      (longitude - coords.lng) ** 2
    );

    if (distance < shortestDistance) {
      shortestDistance = distance;
      nearestCity = city;
    }
  });

  return nearestCity;
}

function sortByUrgencyPriority(items) {
  return [...items].sort((a, b) => (urgencyOrder[b.urgency] || 0) - (urgencyOrder[a.urgency] || 0));
}

function App() {
  const [requests, setRequests] = useState([]);
  const [donors, setDonors] = useState([]);
  const [matches, setMatches] = useState([]);
  const [requestForm, setRequestForm] = useState(defaultRequest);
  const [donorForm, setDonorForm] = useState(defaultDonor);
  const [selectedRequest, setSelectedRequest] = useState(null);
  const [loading, setLoading] = useState(true);

  const totalUnits = useMemo(() => donors.filter((d) => d.availability === 'Available').length, [donors]);
  const priorityRequests = useMemo(() => sortByUrgencyPriority(requests), [requests]);

  const loadMatchesForRequest = async (request) => {
    if (!request) return;

    try {
      const matchResponse = await fetch(`/api/matches?bloodType=${request.bloodType}&location=${request.location}&urgency=${request.urgency}`);
      const matchData = await matchResponse.json();
      setMatches(matchData);
    } catch (error) {
      console.error('Error loading request matches', error);
    }
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const [requestRes, donorRes] = await Promise.all([
          fetch('/api/requests'),
          fetch('/api/donors')
        ]);

        const requestData = await requestRes.json();
        const donorData = await donorRes.json();
        const sortedRequests = sortByUrgencyPriority(requestData);

        setRequests(sortedRequests);
        setDonors(donorData);

        if (sortedRequests[0]) {
          setSelectedRequest(sortedRequests[0]);
          await loadMatchesForRequest(sortedRequests[0]);
        }
      } catch (error) {
        console.error('Error loading data', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();

    socket.on('new_request', (newRequest) => {
      setRequests((prev) => sortByUrgencyPriority([newRequest, ...prev]));
      setSelectedRequest(newRequest);
      loadMatchesForRequest(newRequest);
    });

    socket.on('new_donor', (newDonor) => {
      setDonors((prev) => [newDonor, ...prev]);
    });

    return () => {
      socket.off('new_request');
      socket.off('new_donor');
    };
  }, []);

  useEffect(() => {
    if (selectedRequest) {
      loadMatchesForRequest(selectedRequest);
    }
  }, [selectedRequest]);

  const handleUseLiveLocation = (target) => {
    if (!navigator.geolocation) {
      console.warn('Geolocation is not supported by this browser.');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nearestCity = getNearestCity(position.coords.latitude, position.coords.longitude);
        const liveLocation = `${position.coords.latitude.toFixed(5)}, ${position.coords.longitude.toFixed(5)}`;

        if (target === 'request') {
          setRequestForm((prev) => ({ ...prev, location: nearestCity, liveLocation }));
        }

        if (target === 'donor') {
          setDonorForm((prev) => ({ ...prev, location: nearestCity }));
        }
      },
      (error) => {
        console.error('Unable to fetch live location:', error);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  };

  const handleSendSmsToDonor = (donor) => {
    if (!selectedRequest) return;

    const locationText = selectedRequest.liveLocation || selectedRequest.address || selectedRequest.location;
    const message = `Emergency blood request: ${selectedRequest.patientName} needs ${selectedRequest.bloodType} blood. Address: ${selectedRequest.address || selectedRequest.location}. Live location: ${locationText}. Please contact ${selectedRequest.contact}.`;

    window.location.href = `sms:${donor.phone}?body=${encodeURIComponent(message)}`;
  };

  const createRequest = async (event) => {
    event.preventDefault();
    const response = await fetch('/api/requests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestForm)
    });

    if (response.ok) {
      const newRequest = await response.json();
      setRequests((prev) => sortByUrgencyPriority([newRequest, ...prev]));
      setSelectedRequest(newRequest);
      setRequestForm(defaultRequest);
      await loadMatchesForRequest(newRequest);
    }
  };

  const createDonor = async (event) => {
    event.preventDefault();
    const response = await fetch('/api/donors', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(donorForm)
    });

    if (response.ok) {
      const donor = await response.json();
      setDonors((prev) => [donor, ...prev]);
      setDonorForm(defaultDonor);
    }
  };

  const handleEmergencySupport = async () => {
    const emergencyRequest = {
      ...requestForm,
      urgency: 'Critical',
      bloodType: requestForm.bloodType || 'O+',
      location: requestForm.location || 'Mumbai',
      address: requestForm.address || 'Emergency location',
      contact: requestForm.contact || '9876543210',
      liveLocation: requestForm.liveLocation || ''
    };

    try {
      const response = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(emergencyRequest)
      });

      if (!response.ok) {
        throw new Error('Failed to create emergency request');
      }

      const newRequest = await response.json();
      setRequests((prev) => sortByUrgencyPriority([newRequest, ...prev]));
      setSelectedRequest(newRequest);
      setRequestForm(defaultRequest);
      setMatches(newRequest.matches || []);
    } catch (error) {
      console.error('Error triggering emergency support', error);
    }
  };

  const requestStats = [
    { label: 'Active Requests', value: requests.length },
    { label: 'Available Donors', value: totalUnits },
    { label: 'Critical Cases', value: requests.filter((item) => item.urgency === 'Critical').length }
  ];

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <p className="eyebrow">Esme India</p>
          <h1>LifeDrop India</h1>
        </div>
        <button type="button" className="primary-btn" onClick={handleEmergencySupport}>Emergency Support</button>
      </header>

      <section className="hero">
        <div className="hero-copy">
          <p className="badge">India-wide blood response platform</p>
          <h2>Real-time matching by blood type, location and urgency.</h2>
          <p>
            Find the most compatible donor in seconds, with emergency prioritization and live city-based matching.
          </p>
          <div className="stats-grid">
            {requestStats.map((stat) => (
              <div key={stat.label} className="stat-card">
                <strong>{stat.value}</strong>
                <span>{stat.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="dashboard-panel">
          <div className="panel-header">
            <span>Live Matching</span>
            <span className="live-dot">●</span>
          </div>

          {loading ? (
            <p>Loading matching data...</p>
          ) : (
            <div className="match-list">
              {(matches.length ? matches : donors.slice(0, 3)).map((match, index) => (
                <div key={match._id || `${match.donorName}-${index}`} className="match-row">
                  <div>
                    <strong>{match.donorName || match.patientName || 'Donor'}</strong>
                    <small>{match.location || 'Mumbai'}</small>
                  </div>
                  <div className="match-meta">
                    <span className="tag">{match.bloodType || 'O+'}</span>
                    <span className="urgency" style={{ color: urgencyColors[match.urgency || 'Medium'] }}>
                      {match.urgency || 'Available'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <main className="content-grid">
        <section className="card form-card">
          <h3>Raise Urgent Request</h3>
          <form onSubmit={createRequest}>
            <label>
              Patient Name
              <input
                list="patientNames"
                value={requestForm.patientName}
                onChange={(e) => setRequestForm({ ...requestForm, patientName: e.target.value })}
                placeholder="Enter patient name"
              />
              <datalist id="patientNames">
                {indianNames.map((name) => <option key={name} value={name} />)}
              </datalist>
            </label>

            <label>
              Blood Type
              <select value={requestForm.bloodType} onChange={(e) => setRequestForm({ ...requestForm, bloodType: e.target.value })}>
                {bloodGroups.map((group) => <option key={group} value={group}>{group}</option>)}
              </select>
            </label>

            <label>
              Urgency
              <select value={requestForm.urgency} onChange={(e) => setRequestForm({ ...requestForm, urgency: e.target.value })}>
                {Object.keys(urgencyColors).map((level) => <option key={level} value={level}>{level}</option>)}
              </select>
            </label>

            <label>
              Blood Needed In
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  list="requestCityOptions"
                  value={requestForm.location}
                  onChange={(e) => setRequestForm({ ...requestForm, location: e.target.value })}
                  placeholder="Enter city"
                  style={{ flex: 1 }}
                />
                <button type="button" className="secondary-btn" onClick={() => handleUseLiveLocation('request')}>Use Live Location</button>
              </div>
              <datalist id="requestCityOptions">
                {indianCities.map((city) => <option key={city} value={city} />)}
              </datalist>
            </label>

            <label>
              Contact Number
              <input value={requestForm.contact} onChange={(e) => setRequestForm({ ...requestForm, contact: e.target.value })} />
            </label>

            <label>
              Address
              <input value={requestForm.address} onChange={(e) => setRequestForm({ ...requestForm, address: e.target.value })} placeholder="Hospital / locality / address" />
            </label>

            <button type="submit" className="primary-btn full-width">Find Live Donors</button>
          </form>
        </section>

        <section className="card form-card">
          <h3>Register Donor</h3>
          <form onSubmit={createDonor}>
            <label>
              Donor Name
              <input
                list="donorNames"
                value={donorForm.donorName}
                onChange={(e) => setDonorForm({ ...donorForm, donorName: e.target.value })}
                placeholder="Enter donor name"
              />
              <datalist id="donorNames">
                {indianNames.map((name) => <option key={name} value={name} />)}
              </datalist>
            </label>

            <label>
              Blood Type
              <select value={donorForm.bloodType} onChange={(e) => setDonorForm({ ...donorForm, bloodType: e.target.value })}>
                {bloodGroups.map((group) => <option key={group} value={group}>{group}</option>)}
              </select>
            </label>

            <label>
              Donor Location
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                  list="donorCityOptions"
                  value={donorForm.location}
                  onChange={(e) => setDonorForm({ ...donorForm, location: e.target.value })}
                  placeholder="Enter city"
                  style={{ flex: 1 }}
                />
                <button type="button" className="secondary-btn" onClick={() => handleUseLiveLocation('donor')}>Use Live Location</button>
              </div>
              <datalist id="donorCityOptions">
                {indianCities.map((city) => <option key={city} value={city} />)}
              </datalist>
            </label>

            <label>
              Availability
              <select value={donorForm.availability} onChange={(e) => setDonorForm({ ...donorForm, availability: e.target.value })}>
                {['Available', 'Busy', 'Unavailable'].map((status) => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>

            <label>
              Phone Number
              <input value={donorForm.phone} onChange={(e) => setDonorForm({ ...donorForm, phone: e.target.value })} />
            </label>

            <button type="submit" className="secondary-btn full-width">Add as Donor</button>
          </form>
        </section>

        <section className="card requests-card">
          <div className="section-head">
            <h3>Urgent Requests</h3>
            <span>{requests.length} cases</span>
          </div>

          <div className="request-stack">
            {priorityRequests.map((request) => (
              <button
                key={request._id}
                className={`request-item ${selectedRequest && selectedRequest._id === request._id ? 'active' : ''}`}
                onClick={() => setSelectedRequest(request)}
              >
                <div>
                  <strong>{request.patientName}</strong>
                  <small>{request.location} • {request.bloodType}</small>
                </div>
                <span className="urgency" style={{ color: urgencyColors[request.urgency] }}>
                  {request.urgency}
                </span>
              </button>
            ))}
          </div>
        </section>

        <section className="card matches-card">
          <div className="section-head">
            <h3>Nearest Compatible Donors</h3>
            <span>{matchDataText(selectedRequest, matches)}</span>
          </div>

          {selectedRequest ? (
            <>
              <div className="request-detail-box" style={{ marginBottom: '12px', padding: '12px', borderRadius: '12px' }}>
                <strong>{selectedRequest.patientName}</strong>
                <div style={{ display: 'grid', gap: '4px', marginTop: '8px', fontSize: '14px' }}>
                  <span>Blood Group: {selectedRequest.bloodType}</span>
                  <span>Phone: {selectedRequest.contact}</span>
                  <span>Address: {selectedRequest.address || selectedRequest.location}</span>
                  <span>Live Location: {selectedRequest.liveLocation || 'Not shared yet'}</span>
                </div>
              </div>

              <div className="donor-table">
                {matches.length ? matches.map((match, index) => (
                  <div key={`${match.donorName || 'donor'}-${index}`} className="donor-row">
                    <div>
                      <strong>{match.donorName}</strong>
                      <small>{match.location}</small>
                    </div>
                    <div className="donor-meta">
                      <span className="tag">{match.bloodType}</span>
                      <span>{compatibility[selectedRequest.bloodType]?.includes(match.bloodType) ? 'Compatible' : 'Fallback'}</span>
                      <button type="button" className="secondary-btn" onClick={() => handleSendSmsToDonor(match)}>Send SMS</button>
                    </div>
                  </div>
                )) : (
                  <p className="empty-state">No matching donors currently available.</p>
                )}
              </div>
            </>
          ) : (
            <p className="empty-state">Select a request to view donor matches.</p>
          )}
        </section>
      </main>
    </div>
  );
}

function matchDataText(selectedRequest, matches) {
  if (!selectedRequest) return 'No request selected';
  return `${matches.length} match${matches.length === 1 ? '' : 'es'} for ${selectedRequest.bloodType}`;
}

export default App;
