using System.Collections;
using System.Collections.Generic;
using WebRtc.NET;
using WebSocket4Net;
using LitJson;
using System.Collections.Concurrent;
using System;
using System.IO;
using System.Runtime.InteropServices;
using System.Threading;

namespace P2P
{
    public class Tuple<T1, T2>
    {
        public T1 left;
        public T2 right;
        public Tuple(T1 left, T2 right)
        {
            this.left = left;
            this.right = right;
        }

        public override bool Equals(object obj)
        {
            if (obj.GetType() == typeof(Tuple<T1, T2>))
            {
                Tuple<T1, T2> other = (Tuple<T1, T2>)obj;
                return other.left.Equals(left) && other.right.Equals(right);
            }
            else
            {
                return false;
            }
        }

        public override int GetHashCode()
        {
            return left.GetHashCode() ^ right.GetHashCode();
        }
    }


    public class PeerClass : IDisposable
    {

        WebRtcNative WebRtc;
        WebSocket websocket;
        bool isWebsocketRunning = false;
        float timeWebsocketSftarted;
        public string myId;

        public delegate void OnConnectionCallback(string peer);
        public event OnConnectionCallback OnConnection;

        public delegate void OnDisconnectionCallback(string peer);
        public event OnDisconnectionCallback OnDisconnection;

        public delegate void OnBytesFromPeerCallback(string peer, byte[] bytes);
        public event OnBytesFromPeerCallback OnBytesFromPeer;

        public delegate void OnTextFromPeerCallback(string peer, string text);
        public event OnTextFromPeerCallback OnTextFromPeer;

        public delegate void GetIDCallback(string id);
        public event GetIDCallback OnGetID;

        long createTime;

        string room;

        // Use this for initialization
        public PeerClass(string websocketUrl, string room)
        {
            this.room = room;
            //WebRtcNative.InitializeSSL();
            createTime = GetTimeInMillis();
            myId = System.Guid.NewGuid().ToString();
            websocket = new WebSocket(websocketUrl);
            websocket.Opened += Server_Opened;
            websocket.Error += Server_Error;
            websocket.Closed += Server_Closed;
            websocket.MessageReceived += Server_MessageReceived;
            websocket.Open();
            WebRtc = new WebRtcNative();
        }
        
        public void Send(string peer, byte[] data)
        {
            messageDatasNeedToSend.Enqueue(new Tuple<string, byte[]>(peer, data));

        }
        public void Send(string peer, string text)
        {
            messagesNeedToSend.Enqueue(new Tuple<string, string>(peer, text));
            /*
            if (peersWithDataChannels.Contains(peer))
            {
                peers[peer].DataChannelSendText(text);
            }
            else
            {
                throw new Exception("we haven't connected to " + peer);
            }
            */
        }

        public ConcurrentQueue<Tuple<string, string>> messagesNeedToSend = new ConcurrentQueue<Tuple<string, string>>();
        public ConcurrentQueue<Tuple<string, byte[]>> messageDatasNeedToSend = new ConcurrentQueue<Tuple<string, byte[]>>();
        public ConcurrentQueue<Tuple<string, string>> dataChannelMesagesReceived = new ConcurrentQueue<Tuple<string, string>>();
        public ConcurrentQueue<Tuple<string, byte[]>> dataChannelByteMesagesReceived = new ConcurrentQueue<Tuple<string, byte[]>>();
        public Dictionary<string, WebRtcNative> peers = new Dictionary<string, WebRtcNative>();
        public HashSet<string> peersWithDataChannels = new HashSet<string>();
        public HashSet<string> safeToUpdate = new HashSet<string>();
        public ConcurrentQueue<string> needToSendDataChannelPing = new ConcurrentQueue<string>();
        public ConcurrentQueue<string> peersToConnectTo = new ConcurrentQueue<string>();
        public ConcurrentQueue<string> websocketMessagesReceived = new ConcurrentQueue<string>();
        public ConcurrentQueue<string> websocketMessagesToSend = new ConcurrentQueue<string>();

        private void Server_MessageReceived(object sender, MessageReceivedEventArgs e)
        {
            //Debug.Log("got message: " + e.Message);
            websocketMessagesReceived.Enqueue(e.Message);
        }

        void Log(string text)
        {
            UnityEngine.Debug.Log(text);
            //System.Console.WriteLine(text);
        }

        private void Server_Closed(object sender, System.EventArgs e)
        {
            //Log("closed websocket");
            isWebsocketRunning = false;
        }

        private void Server_Error(object sender, SuperSocket.ClientEngine.ErrorEventArgs e)
        {
            //Debug.Log("websocket error: " + e.Exception);
        }

        private void Server_Opened(object sender, System.EventArgs e)
        {
            //Debug.Log("opened websocket");
            isWebsocketRunning = true;
            timeWebsocketStarted = CurTime;
            timeSentLastPing = 0.0f;
        }

        float timeWebsocketStarted;
        float timeToDoFastPing = 10.0f;
        float slowPingRate = 15.0f;
        float fastPingRate = 2.0f;
        float timeSentLastPing;


        float lastDataChannelPing = 0.0f;
        float dataChannelPingRate = 2.0f;

        // From https://stackoverflow.com/questions/4016483/get-time-in-milliseconds-using-c-sharp
        long GetTimeInMillis()
        {
            return DateTime.Now.Ticks / TimeSpan.TicksPerMillisecond;
        }
        public float CurTime
        {
            get
            {
                return (GetTimeInMillis() - createTime) / 1000.0f;
            }
            private set
            {

            }
        }

        bool firstLoop = true;
        // Update is called once per frame
        public void Update()
        {
            if (firstLoop)
            {
                firstLoop = false;
                if (OnGetID != null)
                {
                    OnGetID(myId);
                }
            }
            if (!isWebsocketRunning)
            {
                return;
            }
            if (CurTime - timeWebsocketStarted < timeToDoFastPing)
            {
                if (CurTime - timeSentLastPing > fastPingRate)
                {
                    SendPing();
                    timeSentLastPing = CurTime;
                }
            }
            else
            {
                if (CurTime - timeSentLastPing > slowPingRate)
                {
                    SendPing();
                    timeSentLastPing = CurTime;
                }
            }
            string needToSendPeer;
            while (needToSendDataChannelPing.TryDequeue(out needToSendPeer))
            {
                peersWithDataChannels.Add(needToSendPeer);
                peers[needToSendPeer].DataChannelSendText("initial ping");
                if (OnConnection != null)
                {
                    OnConnection(needToSendPeer);
                }
            }


            string message;
            while (websocketMessagesReceived.TryDequeue(out message))
            {
                ParseMessage(message);
            }

            while (websocketMessagesToSend.TryDequeue(out message))
            {
                websocket.Send(message);
            }

            string peerToConnectTo;
            while (peersToConnectTo.TryDequeue(out peerToConnectTo))
            {
                if (!peers.ContainsKey(peerToConnectTo))
                {
                    //Debug.Log("trying to connect to: " + peerToConnectTo);
                    SetupConnectionWithPeer(peerToConnectTo);
                    //peers[peerToConnectTo]
                    if (peerToConnectTo.CompareTo(myId) < 0)
                    {
                        peers[peerToConnectTo].InitializePeerConnection();
                        Thread.Sleep(2000);
                        peers[peerToConnectTo].CreateDataChannel("wow");
                        peers[peerToConnectTo].CreateOffer();
                        Thread.Sleep(2000);
                        peers[peerToConnectTo].ProcessMessages(10);
                        safeToUpdate.Add(peerToConnectTo);
                    }
                    else
                    {
                        //peers[peerToConnectTo].InitializePeerConnection();
                        //Thread.Sleep(2000);
                        //peers[peerToConnectTo].ProcessMessages(10);
                    }
                    continue;
                }
            }
            Tuple<string, string> peerAndMessage;
            while (dataChannelMesagesReceived.TryDequeue(out peerAndMessage))
            {
                string peer = peerAndMessage.left;
                string text = peerAndMessage.right;
                if (peersWithDataChannels.Contains(peer))
                {
                    if (OnTextFromPeer != null)
                    {
                        OnTextFromPeer(peer, text);
                    }
                }
                // Initial ping
                else
                {
                    peersWithDataChannels.Add(peer);
                    if (OnConnection != null)
                    {
                        OnConnection(peer);
                    }
                }
            }

            Tuple<string, byte[]> peerAndByteMessage;
            while (dataChannelByteMesagesReceived.TryDequeue(out peerAndByteMessage))
            {
                string peer = peerAndByteMessage.left;
                byte[] data = peerAndByteMessage.right;
                if (peersWithDataChannels.Contains(peer))
                {
                    if (OnBytesFromPeer != null)
                    {
                        OnBytesFromPeer(peer, data);
                    }
                }
                // Initial ping
                else
                {
                    peersWithDataChannels.Add(peer);
                    if (OnConnection != null)
                    {
                        OnConnection(peer);
                    }
                }
            }

            foreach (string peer in safeToUpdate)
            {
                if (peers.ContainsKey(peer))
                {
                    peers[peer].ProcessMessages(10);
                }
            }

            Tuple<string, string> messageToPeer;
            while (messagesNeedToSend.TryDequeue(out messageToPeer))
            {
                string peer = messageToPeer.left;
                string text = messageToPeer.right;
                if (peersWithDataChannels.Contains(peer) && peers.ContainsKey(peer))
                {
                    peers[peer].DataChannelSendText(text);
                }
            }


            Tuple<string, byte[]> messageDatasToPeer;
            while (messageDatasNeedToSend.TryDequeue(out messageDatasToPeer))
            {
                string peer = messageDatasToPeer.left;
                byte[] data = messageDatasToPeer.right;
                if (peersWithDataChannels.Contains(peer) && peers.ContainsKey(peer))
                {
                    peers[peer].DataChannelSendData(data, data.Length);
                }
            }
        }

        void SetupConnectionWithPeer(string peer)
        {
            if (!peers.ContainsKey(peer))
            {
                WebRtcNative curWebRtc = new WebRtcNative();
                curWebRtc.AddServerConfig("stun:stun.l.google.com:19302", string.Empty, string.Empty);
                curWebRtc.AddServerConfig("stun:stun.anyfirewall.com:3478", string.Empty, string.Empty);
                curWebRtc.AddServerConfig("stun:stun.stunprotocol.org:3478", string.Empty, string.Empty);

                curWebRtc.OnIceCandidate += (string sdp_mid, int sdp_mline_index, string sdp) =>
                {
                    CurWebRtc_OnIceCandidate(peer, sdp_mid, sdp_mline_index, sdp);
                };
                curWebRtc.OnSuccessOffer += (string sdp) =>
                {
                    CurWebRtc_OnSuccessOffer(peer, sdp);
                };
                curWebRtc.OnSuccessAnswer += (string sdp) =>
                {
                    CurWebRtc_OnSuccessAnswer(peer, sdp);
                };
                curWebRtc.OnDataMessage += (string message) =>
                {
                    CurWebRtc_OnDataMessage(peer, message);
                };
                curWebRtc.OnDataChannel += (string label) =>
                {
                    CurWebRtc_OnDataChannel(peer, label);
                };
                curWebRtc.OnDataBinaryMessage += (byte[] data) =>
                {
                    CurWebRtc_OnDataBinaryMessage(peer, data);
                };
                curWebRtc.OnError += CurWebRtc_OnError;
                curWebRtc.OnFailure += CurWebRtc_OnFailure;
                //curWebRtc.InitializePeerConnection();
                peers[peer] = curWebRtc;
            }
        }

        private void CurWebRtc_OnDataBinaryMessage(string peer, byte[] data)
        {
            dataChannelByteMesagesReceived.Enqueue(new Tuple<string, byte[]>(peer, data));
        }

        private void CurWebRtc_OnDataChannel(string peer, string label)
        {
            needToSendDataChannelPing.Enqueue(peer);
        }

        private void CurWebRtc_OnDataMessage(string peer, string msg)
        {
            dataChannelMesagesReceived.Enqueue(new Tuple<string, string>(peer, msg));
        }

        private void CurWebRtc_OnFailure(string error)
        {
            Log(myId + " has failure " + error);
        }

        private void CurWebRtc_OnError(string obj)
        {
            Log(myId + " has error " + obj);
        }

        private void CurWebRtc_OnSuccessAnswer(string peer, string sdp)
        {
            //Debug.Log(myId + " made answer");
            JsonData data = new JsonData();
            data["senderId"] = myId;
            data["messageType"] = "answer";
            data["receiverId"] = peer;
            data["sdp"] = sdp;
            websocketMessagesToSend.Enqueue(data.ToJson());
        }

        private void CurWebRtc_OnIceCandidate(string peer, string sdp_mid, int sdp_mline_index, string sdp)
        {
            //Debug.Log(myId + " made ice candidate");
            JsonData data = new JsonData();
            data["senderId"] = myId;
            data["messageType"] = "icecandidate";
            data["receiverId"] = peer;
            data["sdp_mid"] = sdp_mid;
            data["sdp_mline_index"] = sdp_mline_index;
            data["sdp"] = sdp;
            websocketMessagesToSend.Enqueue(data.ToJson());
        }

        private void CurWebRtc_OnSuccessOffer(string peer, string sdp)
        {
            //Debug.Log(myId + " made offer");
            JsonData data = new JsonData();
            data["senderId"] = myId;
            data["messageType"] = "offer";
            data["receiverId"] = peer;
            data["sdp"] = sdp;
            websocketMessagesToSend.Enqueue(data.ToJson());
        }

        void ParseMessage(string message)
        {
            try
            {
                JsonData data = JsonMapper.ToObject(message);
                string senderId = data["senderId"].ToString();
                if (senderId == myId)
                {
                    //Debug.Log("from me: " + message);
                    return;
                }
                string messageType = data["messageType"].ToString();
                if (messageType == "ping")
                {
                    if (data["room"].ToString() != room)
                    {
                        return;
                    }
                    if (!peers.ContainsKey(senderId))
                    {
                        peersToConnectTo.Enqueue(senderId);
                    }
                }
                else if (messageType == "icecandidate")
                {
                    string receiverId = data["receiverId"].ToString();
                    if (receiverId != myId)
                    {
                        //Debug.Log("ice candidate not for me instead for: " + receiverId);
                        return;
                    }

                    SetupConnectionWithPeer(senderId);

                    if (peers.ContainsKey(senderId))
                    {
                        //Debug.Log("added ice candidate from: " + senderId);
                        peers[senderId].AddIceCandidate(data["sdp_mid"].ToString(), (int)data["sdp_mline_index"], data["sdp"].ToString());
                    }
                    else
                    {
                        //Debug.LogError("ice candidate sent from someone we haven't webrtcd with yet even though we tried to?");
                    }
                }
                else if (messageType == "offer")
                {
                    string receiverId = data["receiverId"].ToString();
                    if (receiverId != myId)
                    {
                        // Debug.Log("offer candidate not for me instead for: " + receiverId);
                        return;
                    }
                    //Debug.Log("got offer");
                    SetupConnectionWithPeer(senderId);

                    if (peers.ContainsKey(senderId))
                    {
                        peers[senderId].InitializePeerConnection();
                        Thread.Sleep(1000);
                        //Debug.Log("got offer from: " + senderId);
                        peers[senderId].OnOfferRequest(data["sdp"].ToString());
                        Thread.Sleep(1000);
                        peers[senderId].ProcessMessages(10);
                        safeToUpdate.Add(senderId);
                    }
                    else
                    {
                        //Debug.LogError("ice candidate sent from " + senderId + " who we haven't webrtcd with yet even though we tried to?");
                    }
                }
                else if (messageType == "answer")
                {
                    string receiverId = data["receiverId"].ToString();
                    if (receiverId != myId)
                    {
                        //Debug.Log("offer candidate not for me instead for: " + receiverId);
                        return;
                    }

                    if (!peers.ContainsKey(senderId))
                    {
                        //Debug.Log("got answer from " + senderId + " that we haven't setup up webrtc with?");
                    }
                    else
                    {
                        //Debug.Log("connected to: " + senderId);
                        peers[senderId].OnOfferReply("answer", data["sdp"].ToString());
                        //Debug.Log("got answer from: " + senderId);
                    }
                }
            }
            catch (Exception e)
            {
                Log("failed to parse " + message + " with error " + e.Message + " " + e.StackTrace);
            }
        }

        void SendPing()
        {
            JsonData pingData = new JsonData();
            pingData["senderId"] = myId;
            pingData["messageType"] = "ping";
            pingData["room"] = room;
            try
            {
                websocket.Send(pingData.ToJson());
            }
            catch (Exception e)
            {
                Log("failed to send ping because: " + e.Message + " " + e.ToString());
            }
        }

        object cleanupLock = new object();
        bool isCleanedUp = false;
        void Cleanup()
        {
            lock (cleanupLock)
            {
                if (!isCleanedUp)
                {
                    isCleanedUp = true;

                    foreach (string peer in peers.Keys)
                    {
                        //peers[peer].Dispose();
                    }
                    websocket.Close();
                    websocket.Dispose();
                    //WebRtcNative.CleanupSSL();
                }
            }
        }


        ~PeerClass()
        {
            Cleanup();
        }

        public void Dispose()
        {
            Cleanup();
        }
    }
}