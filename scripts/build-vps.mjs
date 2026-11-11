process.env.LOKA_RUNTIME='node';
process.env.NODE_ENV='production';
process.argv=[process.execPath,new URL('../node_modules/vinext/dist/cli.js',import.meta.url).pathname,'build'];
await import('../node_modules/vinext/dist/cli.js');
