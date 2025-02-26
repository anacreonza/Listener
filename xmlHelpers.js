const fs = require("fs");
const Path = require("path");
const { DOMParser } = require("xmldom");
const saxonJs = require("saxon-js");

function validateXML(xmlFile) {
    if (xmlFile == null) {
        throw new Error("Invalid XML source file");
    };
    const parser = new DOMParser();
    const xml = fs.readFileSync(xmlFile, "utf-8");
    const validXML = parser.parseFromString(xml, "text/xml");
    if (validXML.getElementsByTagName("parsererror").length > 0) {
        console.error(
            `${xmlFile} Parsing error: `,
            validXML.getElementsByTagName("parsererror")[0]
        );
        return false;
    } else {
        return true;
    }
}

async function convertToHtml(xmlSourceFile) {
    if (xmlSourceFile == null) {
        throw new Error("Invalid XML source file");
    }
    return new Promise((resolve, reject) => {
        const fileParts = Path.parse(xmlSourceFile);
        if (validateXML(xmlSourceFile)) {
            const outputFile = Path.join(
                fileParts.dir,
                `${fileParts.name}.html`
            );
            saxonJs
                .transform(
                    {
                        stylesheetFileName:
                            "./ConvertInDesignXMLToHTML.sef.json",
                        sourceFileName: xmlSourceFile,
                        destination: "serialized",
                    },
                    "async"
                )
                .then((output) => {
                    fs.writeFileSync(outputFile, output.principalResult);
                    resolve(outputFile);
                });
        } else {
            reject(`Unable to validate XML file: ${xmlSourceFile}`);
        }
    });
}
async function convertXMLFileToHTML(xmlSourceFile) {
    const htmlFile = await convertToHtml(xmlSourceFile);
    return (`Wrote html file: ${htmlFile}`);
}
module.exports = { convertXMLFileToHTML };
