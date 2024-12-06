const fs = require('fs');
const Path = require('path');
const { Client } = require('@elastic/elasticsearch');
const wwHelpers = require("./wwHelpers");
const inputDir = "D:/pilot01/Listener/Articles/YOU/060624";
const files = fs.readdirSync(inputDir, {recursive: true});
const datefns = require("date-fns");

const articles = files.reduce((acc, item) => {
    if (item.includes(".json") ){
        const articleFile = Path.join(inputDir, item);
        console.log(articleFile);
        const contentRaw = fs.readFileSync(articleFile);
        try {
            const content = JSON.parse(contentRaw);
            let now = datefns.format(new Date(), "yyyy-MM-ddTHH:mm:ss");
            let article = content[0];
            let eventData = {
                "id": `urn:uuid: ${crypto.randomUUID()}`,
                "source": `urn:uuid: ${crypto.randomUUID()}`,
                "specversion": "1.0",
                "type": "com.woodwing.studio/object/properties-updated",
                "datacontenttype": "application/json",
                "subject": "object",
                "time": `${now}`,
                "data": {
                    "Object": { article }
                }
            }
            console.log(article.Metadata.BasicMetadata);

        } catch (error) {
            console.error(`Invalid JSON in file ${articleFile}`);
        }

    }
    return acc
},[]);

articles.forEach((articleToIndex)=>{
    console.log(articleToIndex);
});