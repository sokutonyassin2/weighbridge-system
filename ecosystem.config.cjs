module.exports = {
    apps: [
        {
            name: "weighbridge-api",
            script: "./server/server.js",
            cwd: __dirname,
            watch: false
        },
        {
            name: "weighbridge-ui",
            script: "./node_modules/vite/bin/vite.js",
            cwd: __dirname,
            watch: false,
            interpreter: "node"
        }
    ]
};