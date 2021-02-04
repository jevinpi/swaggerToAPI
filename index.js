const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
// 运行参数
const args = process.argv.splice(2);
// 默认配置
const defaultConfig = {
  // 文件地址
  url: 'https://honeycomb-dev.cloud.cityworks.cn/api/cockpit/swagger',
  // 网络swagger地址还是本地json文件，默认本地
  isNet: false,
  // 生成js还是ts文件，默认ts
  ts: false,
  // 默认文件夹
  floder: 'api',
};
// 数据类型
const DataType =  {
  string: 'string',
  number: 'number',
  boolean: 'boolean',
  array: '[]',
  integer: 'number',
  float: 'number',
  object: 'any',
}
// 获取命令行参数
for(const arg of args) {
  const keyMap = arg.split('=');
  const key = keyMap[0];
  const value = keyMap[1];
  switch (key) {
    case 'isNet':
      defaultConfig.isNet = value === undefined || value === 'true' ? true : defaultConfig.isNet;
      break;
    case 'url':
      defaultConfig.url = value || defaultConfig.url;
      break;
    case 'ts':
      defaultConfig.ts = true;
    case 'typescript':
      defaultConfig.ts = true;
      break;
    case 'floder':
      defaultConfig.floder = value ? value : 'api';
      break;
    default:
      break;
  }
}

const fileType = defaultConfig.ts ? 'ts' : 'js';
// 网络地址
function getNetWork(url) {
  return new Promise((resolve, reject) => {
    const requestHttp = /^https/.test(url) ? https : http;
    requestHttp.get(url, (req, res) => {
      let str = '';
      req.on('data', data => {
        str += data.toString();
      });
      req.on('end', () => {
        resolve(JSON.parse(str));
      });
    }).on('error', e => {
      reject(e);
    })
  })
}

// 本地文件
function readFile(url) {
  return new Promise((resolve, reject) => {
    fs.readFile(path.resolve(__dirname, defaultConfig.url), {encoding: 'utf-8' }, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(JSON.parse(data));
      }
    });
  })
}

// 获取数据
function getData() {
  const { url, isNet } = defaultConfig;
  if (isNet) {
    return getNetWork(url);
  } else {
    return readFile(url);
  }
}
// 删除文件夹
function rmdir(dir, callback) {
  const files = fs.readdirSync(dir);
  function next(index) {
    if (index === files.length) {
      fs.rmdirSync(dir);
      callback();
      return;
    }
    let newPath = path.join(dir, files[index]);
    const stat = fs.statSync(newPath);
    if (stat.isDirectory() ) {
      rmdir(newPath, () => next(index + 1));
    } else {
      fs.unlinkSync(newPath);
      next(index + 1);
    }
  }
  next(0);
}

// 创建文件夹
function createDir(tags) {
  for(const tag of tags) {
    const tagDir = path.resolve(__dirname, defaultConfig.floder, tag.name);
    fs.mkdirSync(tagDir, { recursive: true });
  }
}
// 处理文件夹
function processFolder(tags) {
  const rootDir = path.resolve(__dirname, defaultConfig.floder);
  try {
    fs.accessSync((rootDir));
    rmdir(rootDir, () => createDir(tags));
  } catch (e) {
    createDir(tags);
  }
}

// 获取数据类型
function getInterface(data, jsType = '') {
  const { type } = data;
  if (type === 'array') {
    return getInterface(data.items, DataType[type] + jsType);
  } else if (type === undefined) {
    return `${data['$ref'].slice(14)}Interface${jsType}`;
  } else {
    return DataType[type] + jsType;
  }
}
// 声明文件
function writeInterface(definitions) {
  let InterfaceStr = '';
  for (const key in definitions) {
    const definition = definitions[key];
    if (definition.type === 'object') {
      InterfaceStr += `
/**
* ${definition.description || definition.title || ''}
*/
export interface ${key}Interface {`;
      for (const i in definition.properties) {
        const property = definition.properties[i];
        InterfaceStr += `
  ${property.description ?  `// ${property.description}`: ''}
  ${i}: ${getInterface(property)};`;
      }
      InterfaceStr += `    
}
`;
    }
  }
  fs.writeFile(path.resolve(__dirname, defaultConfig.floder, 'index.interface.ts'), InterfaceStr.trim(), 'utf-8', () => {});
}

// 新增请求参数interface
function parametersInterface(parameters, operationId) {
  let interfaceStr = '';
  if (parameters && Array.isArray(parameters)) {
    interfaceStr = `\nexport interface ${operationId}ParamInterface {`;
    for (param of parameters) {
      interfaceStr += `\n  ${param.name}: ${getInterface(param)};`
    }
    interfaceStr += `${parameters.length && '\n'}}\n`;
  }
  return interfaceStr;
}
// 全部替换
function replaceAll (find, replace, str) {
  var find = find.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
  return str.replace(new RegExp(find, 'g'), replace);
}
// 处理请求方法
function createHttp(paths) {
  const { ts } = defaultConfig;
  let requestCollection = {};
  for (const requestPath in paths) {
    for (method in paths[requestPath]) {
      const methodInfo = paths[requestPath][method];
      const { tags, summary, parameters, responses, operationId } = methodInfo;
      for (const tag of tags) {
        !requestCollection[tag] && (requestCollection[tag] = {
          // ts文件
          content: [],
          // 返回需要依赖全局接口的
          ref: new Set(),
          // 参数接口
          paramsContent: [],
          // 依赖的参数
          paramsRef: new Set(),
        });
        const responseType = getInterface(responses['200'].schema);
        // 请求函数
        const content = `
  /**
   * ${summary}${!!parameters ? parameters.map(value => `\n   * @Param { ${DataType[value.type]} } ${value.name} ${value.description}`).join('') : ''} 
   */
  ${operationId}(params${(ts && parameters && parameters.length) ? `: ${operationId}ParamInterface` : ` = {}`})${ts ? `: Promise<ResponseDataInterface<${responseType}>>` : ''} {
    return instance.${method.toLocaleLowerCase()}(\`${requestPath.replace('{', '${params.')}\`, params);
  }
`;
        // 需要新增的param声明文件
        const paramContent = parametersInterface(parameters, operationId);
        requestCollection[tag].paramsContent.push(paramContent);
        (parameters && parameters.length) && requestCollection[tag].paramsRef.add(`${operationId}ParamInterface`);
        // reponses需要依赖全局的
        const responseTypeInterface = responseType && replaceAll('[]', '', responseType);
        if (responseTypeInterface && !Object.keys(DataType).includes(responseTypeInterface)) {
          requestCollection[tag].ref.add(responseTypeInterface);
        }
        requestCollection[tag].content.push(content);
      }
    }
  }
  return requestCollection;
}

// 复制axios初始文件
function copyIndex() {
  fs.copyFile(`./src/index.${fileType}`, `./${defaultConfig.floder}/index.${fileType}`, (err) => {});
  fs.copyFile(`./src/codeMessages.${fileType}`, `./${defaultConfig.floder}/codeMessages.${fileType}`, () => {});
}
// 写入接口文件
function writeApi(dirName, content, ref, paramsRef) {
  const { ts } = defaultConfig;
  let contentStr = `import instance, { ResponseDataInterface } from '../index';\n`;
  // 返回值引入全局声明
  if (ref.length && ts) {
    contentStr += `
import {
  ${ref.join(',\n  ')}
} from '../index.interface';

`;
  }
  // 引入参数声明
  if (paramsRef.length && ts) {
    contentStr += `import {
  ${paramsRef.join(',\n  ')}
} from './index.params.interface';
`;
  }
  // API主体函数
  contentStr += `
class ${dirName}Instance {  
`
  for (const contentDetail of content) {
    contentStr += contentDetail;
  }
  contentStr += `}

const ${dirName}API = new ${dirName}Instance(); 

export default ${dirName}API;
`;
  fs.writeFile(path.resolve(__dirname, defaultConfig.floder, dirName, `index.${fileType}`), contentStr, 'utf-8', () => {});
}

// 写入param声明文件
function writeParamInterface(dirName, paramsContent) {
  // 写入params声明文件
  let paramContent = ``;
  for (const content of paramsContent) {
    paramContent += content;
  }
  fs.writeFile(path.resolve(__dirname, defaultConfig.floder, dirName, 'index.params.interface.ts'), paramContent, 'utf-8', () => {});
}

// 主函数
async function main() {
  const { url, isNet, ts } = defaultConfig;
  getData().then(res => {
    const { tags, definitions, paths } = res;
    // 处理文件夹
    processFolder(tags);
    // 全局声明文件
    ts && writeInterface(definitions);
    // 复制axios相关文件
    copyIndex();
    const requestCollection = createHttp(paths);
    for (const dirName in requestCollection) {
      const { content, ref, paramsContent, paramsRef } = requestCollection[dirName];
      // 接口文件
      writeApi(dirName, content, [...ref], [...paramsRef]);
      // 参数声明文件
      ts && writeParamInterface(dirName, paramsContent);
    }
  });
}

main();
