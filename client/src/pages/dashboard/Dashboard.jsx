import React, { useEffect, useRef, useState } from 'react';
import socketInstance from '../components/socketio/VideoCallSocket';
import { FaBars, FaTimes, FaPhoneAlt, FaMicrophone, FaVideo, FaVideoSlash,FaPaperPlane , FaMicrophoneSlash } from "react-icons/fa";
import Lottie from "lottie-react";
import { Howl } from "howler";
import wavingAnimation from "../../assets/waving.json";
import { FaPhoneSlash } from "react-icons/fa6";
import { MdScreenShare, MdStopScreenShare } from "react-icons/md";
import apiClient from "../../apiClient";
import { useUser } from '../../context/UserContextApi';
import { RiLogoutBoxLine } from "react-icons/ri";
import { useNavigate } from 'react-router-dom';
import Peer from 'simple-peer';

const Dashboard = () => {
  const { user, updateUser } = useUser();
  const navigate = useNavigate();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [userOnline, setUserOnline] = useState([]);
  const [stream, setStream] = useState(null);
  const [me, setMe] = useState("");
  const [showUserDetailModal, setShowUserDetailModal] = useState(false);
  const [modalUser, setModalUser] = useState(null);

  // Video/Audio elements
  const myVideo = useRef(null);
  const reciverVideo = useRef(null);
  const reciverAudio = useRef(null);
  // Optional: if you want a local audio element, uncomment next line and add an <audio> tag
  // const myAudio = useRef(null);

  const connectionRef = useRef(null);
  const hasJoined = useRef(false);

  const [reciveCall, setReciveCall] = useState(false);
  const [caller, setCaller] = useState(null);
  const [callerName, setCallerName] = useState("");
  const [callerSignal, setCallerSignal] = useState(null);
  const [callAccepted, setCallAccepted] = useState(false);
  const [callerWating, setCallerWating] = useState(false);

  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const screenTrackRef = useRef(null); // keep track of screen track
  const camStreamRef = useRef(null);   // keep original camera stream

  const [callRejectedPopUp, setCallRejectedPopUp] = useState(false);
  const [rejectorData, setCallrejectorData] = useState(null);
  const [callType, setCallType] = useState("video"); // "audio" | "video"

  // Mic/Camera state
  const [isMicOn, setIsMicOn] = useState(true);
  const [isCamOn, setIsCamOn] = useState(true);

  // Ringtone
  const ringtone = new Howl({
    src: ["/ringtone.mp3"],
    loop: false,
    volume: 1.0,
  });

  const socket = socketInstance.getSocket();

  useEffect(() => {
    if (user && socket && !hasJoined.current) {
      socket.emit("join", { id: user._id, name: user.username });
      hasJoined.current = true;
    }

    socket.on("me", (id) => setMe(id));

    socket.on("callToUser", (data) => {
      setReciveCall(true);
      setCaller(data);
      setCallerName(data.name);
      setCallerSignal(data.signal);
      setCallType(data.type || "video"); // <-- capture incoming call type
      ringtone.play();
    });

    socket.on("callRejected", (data) => {
      setCallRejectedPopUp(true);

      setCallrejectorData(data);

      ringtone.stop();
    });

    socket.on("callEnded", (data) => {
      console.log("Call ended by", data.name);
      ringtone.stop();
      endCallCleanup();
    });

    socket.on("userUnavailable", (data) => {
      alert(data.message || "User is not available.");
    });

    socket.on("userBusy", (data) => {
      alert(data.message || "User is currently in another call.");
    });

    socket.on("online-users", (onlineUsers) => {
      setUserOnline(onlineUsers);
    });

    return () => {
      socket.off("me");
      socket.off("callToUser");
      socket.off("callRejected");
      socket.off("callEnded");
      socket.off("userUnavailable");
      socket.off("userBusy");
      socket.off("online-users");
    };
  }, [user, socket]);

  // ---------- VIDEO CALL (caller) ----------
  const startCall = async () => {
    try {
      const currentStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: { echoCancellation: true, noiseSuppression: true }
      });

      setCallType("video"); // <-- set type
      setStream(currentStream);

      if (myVideo.current) {
        myVideo.current.srcObject = currentStream;
        myVideo.current.muted = true;
        myVideo.current.volume = 0;
      }

      currentStream.getAudioTracks().forEach(track => (track.enabled = true));

      setCallRejectedPopUp(false);
      setIsSidebarOpen(false);
      setCallerWating(true);
      setSelectedUser(modalUser._id);

      const peer = new Peer({
        initiator: true,
        trickle: false,
        stream: currentStream
      });

      peer.on("signal", (data) => {
        socket.emit("callToUser", {
          callToUserId: modalUser._id,
          signalData: data,
          from: me,
          name: user.username,
          email: user.email,
          profilepic: user.profilepic,
          type: "video", // <-- send type
        });
      });

      peer.on("stream", (remoteStream) => {
        if (reciverVideo.current) {
          reciverVideo.current.srcObject = remoteStream;
          reciverVideo.current.muted = false;
          reciverVideo.current.volume = 1.0;
        }
      });

      socket.once("callAccepted", (data) => {
        setCallRejectedPopUp(false);
        setCallAccepted(true);
        setCallerWating(false);
        setCaller(data.from);
        peer.signal(data.signal);
      });

      connectionRef.current = peer;
      setShowUserDetailModal(false);
    } catch (error) {
      console.error("Error accessing media devices:", error);
    }
  };

  // ---------- VIDEO CALL (receiver) ----------
  const handelacceptCall = async () => {
    ringtone.stop();
    try {
      // If the caller indicated a type, use it; otherwise default to video
      setCallType(caller?.type || "video");

      const currentStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: { echoCancellation: true, noiseSuppression: true }
      });

      setStream(currentStream);
      if (myVideo.current) {
        myVideo.current.srcObject = currentStream;
      }
      currentStream.getAudioTracks().forEach(track => (track.enabled = true));

      setCallAccepted(true);
      setReciveCall(true);
      setCallerWating(false);
      setIsSidebarOpen(false);

      const peer = new Peer({
        initiator: false,
        trickle: false,
        stream: currentStream
      });

      peer.on("signal", (data) => {
        socket.emit("answeredCall", {
          signal: data,
          from: me,
          to: caller.from,
          type: "video", // <-- send type back
        });
      });

      peer.on("stream", (remoteStream) => {
        if (reciverVideo.current) {
          reciverVideo.current.srcObject = remoteStream;
          reciverVideo.current.muted = false;
          reciverVideo.current.volume = 1.0;
        }
      });

      if (callerSignal) peer.signal(callerSignal);
      connectionRef.current = peer;
    } catch (error) {
      if (error.name === "NotReadableError") {
        alert("Your microphone or camera is already in use by another application.");
      } else if (error.name === "NotAllowedError") {
        alert("You must allow camera & microphone access to accept the call.");
      } else if (error.name === "NotFoundError") {
        alert("No camera or microphone was found on your device.");
      } else {
        alert("Error accessing media devices: " + error.message);
      }
      console.error("Error accessing media devices:", error);
    }
  };

  // ---------- AUDIO CALL (caller) ----------
  const startAudioCall = async () => {
    try {
      const currentStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: { echoCancellation: true, noiseSuppression: true }
      });

      setCallType("audio"); // <-- set type
      setStream(currentStream);
      currentStream.getAudioTracks().forEach(track => (track.enabled = true));

      setCallRejectedPopUp(false);
      setIsSidebarOpen(false);
      setCallerWating(true);
      setSelectedUser(modalUser._id);

      const peer = new Peer({
        initiator: true,
        trickle: false,
        stream: currentStream
      });

      peer.on("signal", (data) => {
        socket.emit("callToUser", {
          callToUserId: modalUser._id,
          signalData: data,
          from: me,
          name: user.username,
          email: user.email,
          profilepic: user.profilepic,
          type: "audio", // <-- send type
        });
      });

      peer.on("stream", (remoteStream) => {
        if (reciverAudio.current) {
          reciverAudio.current.srcObject = remoteStream;
          reciverAudio.current.play();
        }
      });

      socket.once("callAccepted", (data) => {
        setCallRejectedPopUp(false);
        setCallAccepted(true);
        setCallerWating(false);
        setCaller(data.from);
        peer.signal(data.signal);
      });

      connectionRef.current = peer;
      setShowUserDetailModal(false);
    } catch (error) {
      console.error("Error accessing audio devices:", error);
    }
  };

  // ---------- AUDIO CALL (receiver) ----------
  const handelAudioacceptCall = async () => {
    ringtone.stop();
    try {
      setCallType("audio");

      const currentStream = await navigator.mediaDevices.getUserMedia({
        video: false,
        audio: { echoCancellation: true, noiseSuppression: true }
      });

      setStream(currentStream);
      currentStream.getAudioTracks().forEach(track => (track.enabled = true));

      setCallAccepted(true);
      setReciveCall(true);
      setCallerWating(false);
      setIsSidebarOpen(false);

      const peer = new Peer({
        initiator: false,
        trickle: false,
        stream: currentStream
      });

      peer.on("signal", (data) => {
        socket.emit("answeredCall", {
          signal: data,
          from: me,
          to: caller.from,
          type: "audio", // <-- send type back
        });
      });

      peer.on("stream", (remoteStream) => {
        if (reciverAudio.current) {
          reciverAudio.current.srcObject = remoteStream;
          reciverAudio.current.play();
        }
      });

      if (callerSignal) peer.signal(callerSignal);
      connectionRef.current = peer;
    } catch (error) {
      if (error.name === "NotReadableError") {
        alert("Your microphone is already in use by another app.");
      } else if (error.name === "NotAllowedError") {
        alert("You must allow microphone access to accept the call.");
      } else if (error.name === "NotFoundError") {
        alert("No microphone was found on your device.");
      } else {
        alert("Error accessing microphone: " + error.message);
      }
      console.error("Error accessing microphone:", error);
    }
  };

  // ---------- Reject / End ----------
  const handelrejectCall = () => {
    ringtone.stop();
    setCallerWating(false);
    setReciveCall(false);
    setCallAccepted(false);

    socket.emit("reject-call", {
      to: caller.from,
      name: user.username,
      profilepic: user.profilepic,
       callType, // ✅ send callType (audio or video)
    });
  };

  const handelendCall = () => {
    console.log("🔴 Sending call-ended event...");
    ringtone.stop();

    socket.emit("call-ended", {
      to: caller?.from || selectedUser,
      name: user.username
    });

    endCallCleanup();
  };

  const endCallCleanup = () => {
    console.log("🔴 Stopping all media streams and resetting call...");
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
    }
    if (reciverVideo.current) reciverVideo.current.srcObject = null;
    if (myVideo.current) myVideo.current.srcObject = null;
    if (reciverAudio.current) reciverAudio.current.srcObject = null;
    // if (myAudio.current) myAudio.current.srcObject = null;

    connectionRef.current?.destroy();
    ringtone.stop();

    setCallerWating(false);
    setStream(null);
    setReciveCall(false);
    setCallAccepted(false);
     setSelectedUser(null);

    setTimeout(() => {
      window.location.reload();
    }, 100);
  };

  // ---------- Toggles ----------
  const toggleMic = () => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !isMicOn;
        setIsMicOn(audioTrack.enabled);
      }
    }
  };

  const toggleCam = () => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !isCamOn;
        setIsCamOn(videoTrack.enabled);
      }
    }
  };

  // ---------- Screen Share Toggle ----------
const toggleScreenShare = async () => {
  if (!isScreenSharing) {
    try {
      // Get current camera video track
      const videoTrack = stream?.getVideoTracks()[0];
      if (videoTrack) camStreamRef.current = videoTrack;

      // Start screen share
      const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true });
      const screenTrack = screenStream.getTracks()[0];
      screenTrackRef.current = screenTrack;

      // Replace track in simple-peer
      if (connectionRef.current && videoTrack) {
        connectionRef.current.replaceTrack(
          videoTrack,
          screenTrack,
          stream // original camera stream
        );
      }

      // Update local preview
      if (myVideo.current) {
        myVideo.current.srcObject = screenStream;
      }

      // Stop sharing when user closes share popup
      screenTrack.onended = () => {
        stopScreenShare();
      };

      setIsScreenSharing(true);
    } catch (err) {
      console.error("Error starting screen share:", err);
    }
  } else {
    stopScreenShare();
  }
};
const stopScreenShare = () => {
  if (screenTrackRef.current) {
    screenTrackRef.current.stop();
  }

  // Restore camera video track
  if (camStreamRef.current && connectionRef.current) {
    try {
      connectionRef.current.replaceTrack(
        // instead of screenTrackRef.current, pass the old video track
        stream.getVideoTracks()[0],  // old (stopped) screen track placeholder
        camStreamRef.current,        // new camera track
        stream
      );
    } catch (err) {
      console.warn("Skip replaceTrack error:", err.message);
    }
  }

  // Restore local preview
  if (myVideo.current && stream) {
    myVideo.current.srcObject = stream;
  }

  // Reset
  screenTrackRef.current = null;
  setIsScreenSharing(false);
};



  // ---------- Data / Users ----------
  const allusers = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get('/user');
      if (response.data.success !== false) {
        setUsers(response.data.users);
      }
    } catch (error) {
      console.error("Failed to fetch users", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    allusers();
  }, []);

  const isOnlineUser = (userId) =>
    userOnline.some((u) => u.userId === userId);

  const handelSelectedUser = (userId) => {
    if (callAccepted || reciveCall) {
      alert("You must end the current call before starting a new one.");
      return;
    }
    const selected = filteredUsers.find(user => user._id === userId);
    setModalUser(selected);
    setShowUserDetailModal(true);
  };

  const filteredUsers = users.filter((u) =>
    u.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
    u.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleLogout = async () => {
    if (callAccepted || reciveCall) {
      alert("You must end the call before logging out.");
      return;
    }
    try {
      await apiClient.post('/auth/logout');
      socket.off("disconnect");
      socket.disconnect();
      socketInstance.setSocket();
      updateUser(null);
      localStorage.removeItem("userData");
      navigate('/login');
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  

  return (
    <div className="flex min-h-screen bg-gray-100">
      {/* Mobile Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-10 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        ></div>
      )}

      {/* Sidebar */}
      <aside
        className={`bg-gradient-to-br from-blue-900 to-purple-800 text-white w-64 h-full
           p-4 space-y-4 fixed z-20 transition-transform ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"
          } md:translate-x-0`}
      >
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Users</h1>
          <button
            type="button"
            className="md:hidden text-white"
            onClick={() => setIsSidebarOpen(false)}
          >
            <FaTimes />
          </button>
        </div>

        {/* Search */}
        <input
          type="text"
          placeholder="Search user..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-gray-800 text-white border border-gray-700 mb-2"
        />

        {/* User List */}
        <ul className="space-y-4 overflow-y-auto">
          {filteredUsers.map((user) => (
            <li
              key={user._id}
              className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer ${selectedUser === user._id
                ? "bg-green-600"
                : "bg-gradient-to-r from-purple-600 to-blue-400"
                }`}
              onClick={() => handelSelectedUser(user._id)}
            >
              <div className="relative">
                <img
                  src={user.profilepic || "/default-avatar.png"}
                  alt={`${user.username}'s profile`}
                  className="w-10 h-10 rounded-full border border-white"
                />
                {isOnlineUser(user._id) && (
                  <span className="absolute top-0 right-0 w-3 h-3 bg-green-500 border-2 border-gray-800 rounded-full shadow-lg animate-bounce"></span>
                )}
              </div>
              <div className="flex flex-col">
                <span className="font-bold text-sm">{user.username}</span>
                <span className="text-xs text-gray-400 truncate w-32">
                  {user.email}
                </span>
              </div>
            </li>
          ))}
        </ul>

        {/* Logout */}
        {user && <div
          onClick={handleLogout}
          className="absolute bottom-2 left-4 right-4 flex items-center gap-2 bg-red-400 px-4 py-1 cursor-pointer rounded-lg"
        >
          <RiLogoutBoxLine />
          Logout
        </div>}
      </aside>

      {/* Main Content */}
      {selectedUser || reciveCall || callAccepted ? (
        <div className="relative w-full h-screen bg-black flex items-center justify-center">

          {/* Remote Media */}
          {callerWating ? (
            <div>
              <div className="flex flex-col items-center">
                <p className="font-black text-xl mb-2">User Details</p>
                <img
                  src={modalUser?.profilepic || "/default-avatar.png"}
                  alt="User"
                  className="w-20 h-20 rounded-full border-4 border-blue-500 animate-bounce"
                />
                <h3 className="text-lg font-bold mt-3 text-white">{modalUser?.username}</h3>
                <p className="text-sm text-gray-300">{modalUser?.email}</p>
              </div>
            </div>
          ) : callType === "video" ? (
            <video
              ref={reciverVideo}
              autoPlay
              className="absolute top-0 left-0 w-full h-full object-contain rounded-lg"
            />
          ) : (
            <div className="flex flex-col items-center">
              {/* Audio Call — show avatar instead of video */}
              <img
                src={modalUser?.profilepic || "/default-avatar.png"}
                alt="User"
                className="w-40 h-40 rounded-full border-4 border-green-500"
              />
              <audio ref={reciverAudio} autoPlay hidden />
              <h3 className="text-lg font-bold mt-3 text-white">{modalUser?.username}</h3>
              <p className="text-sm text-gray-300">{modalUser?.email}</p>
            </div>
          )}

          {/* Local PIP (only for video calls) */}
          {callType === "video" && (
            <div className="absolute bottom-[75px] md:bottom-0 right-1 bg-gray-900 rounded-lg overflow-hidden shadow-lg">
              <video
                ref={myVideo}
                autoPlay
                playsInline
                className="w-32 h-40 md:w-56 md:h-52 object-cover rounded-lg"
              />
            </div>
          )}

          {/* Username + Sidebar Button */}
          <div className="absolute top-4 left-4 text-white text-lg font-bold flex gap-2 items-center">
            <button
              type="button"
              className="md:hidden text-2xl text-white cursor-pointer"
              onClick={() => setIsSidebarOpen(true)}
            >
              <FaBars />
            </button>
            {callerName || "Caller"}
          </div>

          {/* Call Controls */}
          <div className="absolute bottom-4 w-full flex justify-center gap-4">
            <button
              type="button"
              className="bg-red-600 p-4 rounded-full text-white shadow-lg cursor-pointer"
              onClick={handelendCall}
            >
              <FaPhoneSlash size={24} />
            </button>
             
       {/* Screen share toggle only for video calls */}
{callType === "video" && callAccepted && (
  <button
    type="button"
    onClick={toggleScreenShare}
    className={`p-4 rounded-full text-white shadow-lg cursor-pointer transition-colors ${
      isScreenSharing ? "bg-red-600" : "bg-green-600"
    }`}
  >
    {isScreenSharing ? (
      <MdStopScreenShare size={24} />
    ) : (
      <MdScreenShare size={24} />
    )}
  </button>
)}

            {/* Mic Toggle */}
            <button
              type="button"
              onClick={toggleMic}
              className={`p-4 rounded-full text-white shadow-lg cursor-pointer transition-colors ${isMicOn ? "bg-green-600" : "bg-red-600"}`}
            >
              {isMicOn ? <FaMicrophone size={24} /> : <FaMicrophoneSlash size={24} />}
            </button>

            {/* Camera Toggle only for video calls */}
            {callType === "video" && (
              <button
                type="button"
                onClick={toggleCam}
                className={`p-4 rounded-full text-white shadow-lg cursor-pointer transition-colors ${isCamOn ? "bg-green-600" : "bg-red-600"}`}
              >
                {isCamOn ? <FaVideo size={24} /> : <FaVideoSlash size={24} />}
              </button>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 p-6 md:ml-72 text-white">
          {/* Mobile Sidebar Toggle */}
          <button
            type="button"
            className="md:hidden text-2xl text-black mb-4"
            onClick={() => setIsSidebarOpen(true)}
          >
            <FaBars />
          </button>

          {/* Welcome */}

       {/* Navbar: show only if a user is selected from sidebar */}
{modalUser ? (
  <>
    {/* Top Navbar */}
    <nav className="flex flex-col sm:flex-row items-center 
                justify-center sm:justify-start lg:justify-between 
                bg-gray-800 shadow-md 
                px-2 sm:px-4 lg:px-6 
                rounded-xl py-3 
                gap-2 sm:gap-4 ">
      {/* User Info */}
      <div className="flex items-center gap-3 sm:gap-4">
        <img
          src={modalUser.profilepic || "/default-avatar.png"}
          alt="User"
          className="w-12 h-12 sm:w-14 sm:h-14 md:w-16 md:h-16 rounded-full border-2 md:border-4 border-blue-500"
        />
        <div className="text-white text-center sm:text-left">
          <h3 className="font-bold text-base sm:text-lg md:text-xl">
            {modalUser.username}
          </h3>
          <p className="text-xs sm:text-sm md:text-base text-gray-300">
            {modalUser.email}
          </p>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-2 sm:gap-4">
        <button
          onClick={() => {
            setSelectedUser(modalUser._id);
            startAudioCall();
          }}
          className="bg-green-600 text-white px-3 sm:px-4 md:px-5 py-2 rounded-lg flex items-center gap-2 text-sm sm:text-base md:text-lg"
        >
          <FaPhoneAlt /> Audio
        </button>

        <button
          onClick={() => {
            setSelectedUser(modalUser._id);
            startCall();
          }}
          className="bg-green-600 text-white px-3 sm:px-4 md:px-5 py-2 rounded-lg flex items-center gap-2 text-sm sm:text-base md:text-lg"
        >
          <FaVideo /> Video
        </button>
      </div>
    </nav>

    {/* Bottom Input */}


  </>
) : (
  <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-5 mb-6 mt-4 bg-gray-800 p-4 sm:p-6 md:p-8 rounded-xl shadow-md text-center sm:text-left">
    <div className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20">
      <Lottie animationData={wavingAnimation} loop autoplay />
    </div>
    <div>
      <h1 className="text-xl sm:text-2xl md:text-4xl font-extrabold bg-gradient-to-r from-blue-400 to-purple-500 text-transparent bg-clip-text">
        Hey {user?.username || "Guest"}! 👋
      </h1>
      <p className="text-sm sm:text-base md:text-lg text-gray-300 mt-2">
        Ready to <strong>connect with friends instantly?</strong>  
        Just <strong>select a user</strong> and start your video or audio call!
      </p>
    </div>
  </div>
)}




          {/* <div className="flex items-center gap-5 mb-6 mt-4 bg-gray-800 p-5 rounded-xl shadow-md">
            <div className="w-20 h-20">
              <Lottie animationData={wavingAnimation} loop autoplay />
            </div>
            <div>
              <h1 className="text-4xl font-extrabold bg-gradient-to-r from-blue-400 to-purple-500 text-transparent bg-clip-text">
                Hey {user?.username || "Guest"}! 👋
              </h1>
              <p className="text-lg text-gray-300 mt-2">
                Ready to <strong>connect with friends instantly?</strong>
                Just <strong>select a user</strong> and start your video or audio call!
              </p>
            </div>
          </div> */}

          {/* Instructions */}
          {/* <div className="bg-gray-800 p-4 rounded-lg mt-4 shadow-lg text-sm">
            <h2 className="text-lg font-semibold mb-2">💡 How to Start a Call?</h2>
            <ul className="list-disc pl-5 space-y-2 text-gray-400">
              <li>📌 Open the sidebar to see online users.</li>
              <li>🔍 Use the search bar to find a specific person.</li>
              <li>🎥 Click a user → choose <strong>Video</strong> or <strong>Audio</strong>.</li>
            </ul>
          </div> */}
        </div>
      )}

      {/* Call user modal */}
      {/* {showUserDetailModal && modalUser && (
        <div className="fixed inset-0 bg-transparent bg-opacity-30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
            <div className="flex flex-col items-center">
              <p className='font-black text-xl mb-2'>User Details</p>
              <img
                src={modalUser.profilepic || "/default-avatar.png"}
                alt="User"
                className="w-20 h-20 rounded-full border-4 border-blue-500"
              />
              <h3 className="text-lg font-bold mt-3">{modalUser.username}</h3>
              <p className="text-sm text-gray-500">{modalUser.email}</p>

              <div className="flex gap-4 mt-5">
                <button
                  onClick={() => {
                    setSelectedUser(modalUser._id);
                    startAudioCall();
                    setShowUserDetailModal(false);
                  }}
                  className="bg-green-600 text-white px-4 py-1 rounded-lg w-28 flex items-center gap-2 justify-center"
                >
                  Call <FaPhoneAlt />
                </button>
                <button
                  onClick={() => {
                    setSelectedUser(modalUser._id);
                    startCall();
                    setShowUserDetailModal(false);
                  }}
                  className="bg-green-600 text-white px-4 py-1 rounded-lg w-28 flex items-center gap-2 justify-center"
                >
                  Call <FaVideo />
                </button>
                <button
                  onClick={() => setShowUserDetailModal(false)}
                  className="bg-gray-400 text-white px-4 py-1 rounded-lg w-28"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )} */}

     {/* Call rejection PopUp */}
{callRejectedPopUp && (
  <div className="fixed inset-0 bg-transparent bg-opacity-30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
      <div className="flex flex-col items-center">
        <p className="font-black text-xl mb-2">Call Rejected From...</p>
        <img
          src={rejectorData?.profilepic || "/default-avatar.png"}
          alt="Caller"
          className="w-20 h-20 rounded-full border-4 border-green-500"
        />
        <h3 className="text-lg font-bold mt-3">{rejectorData?.name}</h3>

        <div className="flex gap-4 mt-5">
          {/* Call Again Button */}
<button
  type="button"
  onClick={() => {
    if (rejectorData?.callType === "audio") {
      startAudioCall();
    } else {
      startCall();
    }
  }}
  className="bg-green-500 text-white px-4 py-1 rounded-lg w-28 flex gap-2 justify-center items-center"
>
  {rejectorData?.callType === "audio" ? (
    <>
      Call Again <FaPhoneAlt />
    </>
  ) : (
    <>
      Call Again <FaVideo />
    </>
  )}
</button>


          {/* Back Button */}
          <button
            type="button"
            onClick={() => {
              endCallCleanup();
              setCallRejectedPopUp(false);
              setShowUserDetailModal(false);
            }}
            className="bg-red-500 text-white px-4 py-2 rounded-lg w-28 flex gap-2 justify-center items-center"
          >
            Back <FaPhoneSlash />
          </button>
        </div>
      </div>
    </div>
  </div>
)}


      {/* Incoming Call Modal */}
      {reciveCall && !callAccepted && (
        <div className="fixed inset-0 bg-transparent bg-opacity-30 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
            <div className="flex flex-col items-center">
              <p className="font-black text-xl mb-2">Call From...</p>
              <img
                src={caller?.profilepic || "/default-avatar.png"}
                alt="Caller"
                className="w-20 h-20 rounded-full border-4 border-green-500"
              />
              <h3 className="text-lg font-bold mt-3">{callerName}</h3>
              <p className="text-sm text-gray-500">{caller?.email}</p>
              <div className="flex gap-4 mt-5">
                {/* Accept as AUDIO */}
               {callType === "audio" ? (
                <button
                  type="button"
                  onClick={handelAudioacceptCall} // <-- fixed name
                  className="bg-green-500 text-white px-4 py-1 rounded-lg w-28 flex gap-2 justify-center items-center"
                >
                  Accept <FaPhoneAlt />
                </button>
                ) : (
                // {/* Accept as VIDEO */}
                <button
                  type="button"
                  onClick={handelacceptCall}
                  className="bg-green-500 text-white px-4 py-1 rounded-lg w-28 flex gap-2 justify-center items-center"
                >
                  Accept <FaVideo />
                </button>
                )}
                <button
                  type="button"
                  onClick={handelrejectCall}
                  className="bg-red-500 text-white px-4 py-2 rounded-lg w-28 flex gap-2 justify-center items-center"
                >
                  Reject <FaPhoneSlash />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
