const dotenv = require("dotenv");
dotenv.config();
const im = require("imagemagick");
// const gs = require("ghostscript4js");
const Path = require("node:path");
const fs = require("node:fs");
const datefns = require("date-fns");
const logFilePath = Path.join(__dirname, "activityLog.log");

const xMaxSize = 700;
const yMaxSize = 700;

function log(message){
    let now = datefns.format(new Date(), "yyyy-MM-dd HH:mm");
    let logMsg = `${now} ${message}`;
    console.log(logMsg);
    fs.appendFileSync(logFilePath, `${logMsg}\n` );
}

im.convert.path = "C:\\Program Files\\ImageMagick-7.1.1-Q16-HDRI\\magick.exe";
// Queue processor
class Queue {
    constructor(concurrency) {
        this.concurrency = concurrency;
        this.images = [];
        this.activeCount = 0;
    }

    enqueue(image) {
        this.images.push(image);
        this.processQueue();
    }

    async processQueue() {
        while (this.activeCount < this.concurrency && this.images.length > 0) {
            const image = this.images.shift();
            this.activeCount++;
            try {
                makeLowResImage(image).then((outputFileName) => {
                    log(`Low res image created: ${outputFileName}`);
                });
            } catch (error) {
                log("Error processing task:", error);
            } finally {
                this.activeCount--;
                this.processQueue(); // Process the next task
            }
        }
    }
}
function add(image) {
    const queue = new Queue(5);
    queue.enqueue(image);
}

function makeLowResImage(image) {
    return new Promise((resolve, reject) => {
        let outputFileName = Path.parse(image.sourceFile).name + ".png";
        let outputLayerFileName = Path.parse(image.sourceFile).name + "-0.png";
        outputFileName = outputFileName.replace(/ /g, "_");
        let fileExt = Path.parse(image.sourceFile)
            .ext.replace(".", "")
            .toLowerCase();
        let outputFile = Path.join(
            image.outputDir,
            outputFileName.replace(/ /g, "_") // Replace spaces in image name with underscores
        );
        // Multi-layer PSDs extract to multiple files - with -0 etc appended to the filename. Promise will be rejected if output file name differs
        let outputLayerFile = Path.join(
            image.outputDir,
            outputLayerFileName.replace(/ /g, "_") // Replace spaces in image layer name with underscores
        );
        im.readMetadata(image.sourceFile, (err, metadata) => {
            if (err) throw err;
            let conversionSettings = [];
            let newSize = `${xMaxSize}x${yMaxSize}`;
            // console.log(metadata);
            switch (fileExt) {
                // case "eps":
                //     let fixedName =
                //         Path.parse(sourceImage).name.replace(" ", "") + ".eps";
                //     let newFile = Path.join(inputDir, fixedName);
                //     fs.renameSync(sourceImage, newFile);
                //     const outputJPEG = Path.join(
                //         outputDir,
                //         Path.parse(fixedName).name + ".jpg"
                //     );
                //     let conversionString = `-dSAFER -dBATCH -dNOPAUSE -dEPSCrop -sDEVICE=jpeg -dGraphicsAlphaBits=4 -r650x650 -sOutputFile=${outputJPEG} ${sourceImage}`;
                //     try {
                //         gs.executeSync(conversionString);
                //         if (fs.existsSync(outputJPEG)) {
                //             let outputImage = Path.join(
                //                 outputDir,
                //                 Path.parse(outputJPEG).name + "-web.webp"
                //             );
                //             epsToWebpSettings = [outputJPEG, outputImage];
                //             im.convert(epsToWebpSettings, (err, stdout) => {
                //                 if (err) throw err;
                //                 if (stdout) console.log(stdout);
                //                 if (fs.existsSync(outputImage)) {
                //                     if (fs.existsSync(outputJPEG)) {
                //                         fs.unlinkSync(outputJPEG);
                //                     }
                //                     resolve(outputImage);
                //                 } else {
                //                     reject(`Unable to create output file.`);
                //                 }
                //             });
                //             resolve(outputImage);
                //         } else {
                //             reject(`Low res file not created: ${outputImage}`);
                //         }
                //     } catch (gsError) {
                //         throw gsError;
                //     }
                //     break;

                default:
                    conversionSettings = [
                        image.sourceFile,
                        "-resize",
                        newSize,
                        "-density",
                        "72",
                        "-quality",
                        "80",
                        "-profile",
                        "./CoatedFOGRA39.icc",
                        "-profile",
                        "./AdobeRGB1998.icc",
                        outputFile,
                    ];
                    im.convert(conversionSettings, (err, stdout) => {
                        if (err) throw err;
                        if (stdout) {
                           log(stdout);
                        }
                        if (fs.existsSync(outputLayerFile)){
                            log(`Successfully created low res layer file: ${outputLayerFile}`);
                            resolve(outputLayerFile);
                        }
                        if (fs.existsSync(outputFile)) {
                            log(`Successfully created low res of image: ${outputFile}`);
                            resolve(outputFile);
                        } else {
                            reject(`Low res file not created: ${outputFile}`);
                        }
                    });
                    break;
            }
        });
    });
}

module.exports = { makeLowResImage, add };
