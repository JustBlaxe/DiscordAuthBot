const c = {
  r: "\x1b[0m",
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
};

export const log = {
  info: (msg: string) => console.log(`${c.blue}INFO${c.r} ${msg}`),
  ok: (msg: string) => console.log(`${c.green}OK${c.r} ${msg}`),
  warn: (msg: string) => console.log(`${c.yellow}WARN${c.r} ${msg}`),
  error: (msg: string) => console.log(`${c.red}ERROR${c.r} ${msg}`),
  verified: (user: string, ip: string) => console.log(`${c.green}VERIFIED${c.r} ${user} (${ip})`),
  blocked: (user: string, reason: string) => console.log(`${c.red}BLOCKED${c.r} ${user} - ${reason}`),
  vpn: (ip: string, isp: string) => console.log(`${c.magenta}VPN${c.r} ${ip} (${isp})`),
};
