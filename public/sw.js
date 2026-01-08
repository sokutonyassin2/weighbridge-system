const CACHE_NAME = 'weighbridge-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/static/js/bundle.js',
  '/static/js/vendors.js',
  '/static/css/main.css',
  '/manifest.json',
  '/favicon.ico',
  '/logo192.png',
  '/logo512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Opened cache');
        return cache.addAll(urlsToCache);
      })
  );
});

self.addEventListener('fetch', (event) => {
  // Handle API requests separately
  if (event.request.url.includes('/api/') || 
      event.request.url.includes('supabase') || 
      event.request.url.includes('localhost') || 
      event.request.url.includes('127.0.0.1')) {
    
    // For POST, PUT, PATCH requests (mutations), we need special handling
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(event.request.method)) {
      event.respondWith(
        fetch(event.request.clone())
          .then((response) => {
            // Clone the response to store in cache
            const responseToCache = response.clone();
            
            // Store in cache for future offline use
            caches.open(CACHE_NAME)
              .then((cache) => {
                cache.put(event.request, responseToCache);
              });
            
            return response;
          })
          .catch(() => {
            // If network fails on mutations, store in offline queue
            return handleOfflineMutation(event.request);
          })
      );
    } else {
      // For GET requests - handle critical data specially
      if (event.request.url.includes('vehicle_types')) {
        // For critical data like vehicle types, try cache first then network
        event.respondWith(
          caches.match(event.request)
            .then((cachedResponse) => {
              // If we have a cached response, return it
              if (cachedResponse) {
                // Update cache in the background
                fetch(event.request.clone())
                  .then((networkResponse) => {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME)
                      .then((cache) => {
                        cache.put(event.request, responseToCache);
                      });
                  })
                  .catch(() => {
                    // Network failed, but we have cached data
                  });
                
                return cachedResponse;
              }
              
              // If no cached response, try network
              return fetch(event.request.clone())
                .then((networkResponse) => {
                  // Cache the response for future use
                  const responseToCache = networkResponse.clone();
                  caches.open(CACHE_NAME)
                    .then((cache) => {
                      cache.put(event.request, responseToCache);
                    });
                  
                  return networkResponse;
                })
                .catch(() => {
                  // Network failed and no cache available
                  return new Response(JSON.stringify({ error: 'No network connection and no cached data available' }), {
                    status: 503,
                    headers: { 'Content-Type': 'application/json' }
                  });
                });
            })
        );
      } else {
        // For other GET requests
        event.respondWith(
          fetch(event.request)
            .then((response) => {
              // Clone the response to store in cache
              const responseToCache = response.clone();
              
              // Store in cache for future offline use
              caches.open(CACHE_NAME)
                .then((cache) => {
                  cache.put(event.request, responseToCache);
                });
              
              return response;
            })
            .catch(() => {
              // If network fails, try cache
              return caches.match(event.request)
                .then((response) => {
                  if (response) {
                    return response;
                  }
                  // Return a default response for API calls when offline
                  return new Response(JSON.stringify({ offline: true, error: 'No cached data available' }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' }
                  });
                });
            })
        );
      }
    }
  } else {
    // Handle static assets
    event.respondWith(
      caches.match(event.request)
        .then((response) => {
          // Return cached version or fetch from network
          if (response) {
            return response;
          }
          return fetch(event.request);
        })
    );
  }
});

// Function to handle offline mutations
async function handleOfflineMutation(request) {
  const clone = request.clone();
  const body = await clone.text();
  
  // Store the request details in IndexedDB or localStorage for later sync
  const offlineRequest = {
    url: request.url,
    method: request.method,
    headers: [...request.headers.entries()],
    body: body,
    timestamp: Date.now()
  };
  
  // Add to offline queue
  const offlineQueue = JSON.parse(localStorage.getItem('offlineQueue') || '[]');
  offlineQueue.push(offlineRequest);
  localStorage.setItem('offlineQueue', JSON.stringify(offlineQueue));
  
  // Return a response indicating the request is queued
  return new Response(JSON.stringify({ queued: true, message: 'Request stored offline' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' }
  });
}

// Listen for messages from the main thread
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SYNC_DATA') {
    // Trigger data sync when online
    syncOfflineData();
  }
});

async function syncOfflineData() {
  // Get offline data from storage
  const offlineData = await getOfflineData();
  
  for (const item of offlineData) {
    try {
      // Attempt to sync each item to the server
      const response = await fetch(item.url, {
        method: item.method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(item.data),
      });
      
      if (response.ok) {
        // Remove from offline storage after successful sync
        await removeOfflineData(item.id);
      }
    } catch (error) {
      console.error('Failed to sync data:', error);
    }
  }
}

async function getOfflineData() {
  // This is a simplified version - in practice, you'd use IndexedDB or localStorage
  return [];
}

async function removeOfflineData(id) {
  // Remove specific item from offline storage
}