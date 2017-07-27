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
    public class Peer : IDisposable
    {
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

        public PeerClass myPeer;
        volatile bool needToCleanUp = false;

        public ConcurrentQueue<Tuple<string, string>> messagesToSend = new ConcurrentQueue<Tuple<string, string>>();
        public ConcurrentQueue<Tuple<string, byte[]>> byteMessagesToSend = new ConcurrentQueue<Tuple<string, byte[]>>();
        public ConcurrentQueue<string> peersConnecting = new ConcurrentQueue<string>();
        public ConcurrentQueue<string> peersDisconnecting = new ConcurrentQueue<string>();
        public ConcurrentQueue<Tuple<string, string>> peerMessages = new ConcurrentQueue<Tuple<string, string>>();
        public ConcurrentQueue<Tuple<string, byte[]>> peerByteMessages = new ConcurrentQueue<Tuple<string, byte[]>>();

        string room;

        public Peer(string wsUrl, string room)
        {
            this.room = room;
            Thread bean = new Thread(() =>
            {
                myPeer = new PeerClass(wsUrl, room);
                myPeer.OnConnection += Peer_OnConnection;
                myPeer.OnDisconnection += Peer_OnDisconnection;
                myPeer.OnTextFromPeer += Peer_OnTextFromPeer;
                myPeer.OnBytesFromPeer += Peer_OnBytesFromPeer;

                while (!needToCleanUp)
                {
                    Thread.Sleep(10);
                    myPeer.Update();

                    Tuple<string, string> peerAndMessage;
                    while (messagesToSend.TryDequeue(out peerAndMessage))
                    {
                        myPeer.Send(peerAndMessage.left, peerAndMessage.right);
                    }

                    Tuple<string, byte[]> peerAndByteMessage;
                    while (byteMessagesToSend.TryDequeue(out peerAndByteMessage))
                    {
                        myPeer.Send(peerAndByteMessage.left, peerAndByteMessage.right);
                    }
                }

                myPeer.Dispose();
            });
            bean.IsBackground = false;
            bean.Start();
        }

        private void Peer_OnBytesFromPeer(string peer, byte[] bytes)
        {
            peerByteMessages.Enqueue(new Tuple<string, byte[]>(peer, bytes));
        }

        bool sentMyId = false;
        public void Update()
        {
            if (myPeer != null && !sentMyId)
            {
                sentMyId = true;
                if (OnGetID != null)
                {
                    OnGetID(myPeer.myId);
                }
            }
            string peer;
            while (peersConnecting.TryDequeue(out peer))
            {
                if (OnConnection != null)
                {
                    OnConnection(peer);
                }
            }

            while (peersDisconnecting.TryDequeue(out peer))
            {
                if (OnDisconnection != null)
                {
                    OnDisconnection(peer);
                }
            }

            Tuple<string, string> peerAndMessage;
            while (peerMessages.TryDequeue(out peerAndMessage))
            {
                peer = peerAndMessage.left;
                string message = peerAndMessage.right;
                if (OnTextFromPeer != null)
                {
                    OnTextFromPeer(peer, message);
                }
            }

            Tuple<string, byte[]> peerAndByteMessage;
            while (peerByteMessages.TryDequeue(out peerAndByteMessage))
            {
                peer = peerAndByteMessage.left;
                byte[] data = peerAndByteMessage.right;
                if (OnTextFromPeer != null)
                {
                    OnBytesFromPeer(peer, data);
                }
            }
        }

        private void Peer_OnTextFromPeer(string peer, string text)
        {
            peerMessages.Enqueue(new Tuple<string, string>(peer, text));
        }

        private void Peer_OnDisconnection(string peer)
        {
            peersDisconnecting.Enqueue(peer);
        }

        private void Peer_OnConnection(string peer)
        {
            peersConnecting.Enqueue(peer);
        }


        public void Send(string peer, string message)
        {
            messagesToSend.Enqueue(new Tuple<string, string>(peer, message));
        }

        public void Send(string peer, byte[] data)
        {
            Send(peer, data, 0, data.Length);
        }

        public void Send(string peer, byte[] data, int offset, int len)
        {
            // An alternative is to ensure they don't change their buffer before it is sent but for now this should be fine
            byte[] actualData = new byte[len];
            Buffer.BlockCopy(data, offset, actualData, 0, len);
            byteMessagesToSend.Enqueue(new Tuple<string, byte[]>(peer, actualData));
        }
        
        public void Dispose()
        {
            needToCleanUp = true;
        }

        ~Peer()
        {
            needToCleanUp = true;
        }
    }
}