module.exports = {
    apps: [
        {
            name: "weighbridge-api",
            script: "./server/server.js",
            cwd: "C:/weighbridge-system",
            watch: false
        },
        {
            name: "weighbridge-ui",
            script: "./node_modules/vite/bin/vite.js",
            cwd: "C:/weighbridge-system",
            watch: false,
            interpreter: "node"
        }
    ]
};