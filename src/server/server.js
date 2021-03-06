
var properties = PropertiesService.getScriptProperties();

function get_property(key) {
    value = properties.getProperty(key);

    if (value == null || value == "") {
        Logger.log("Warning: Properties have not been set up or are empty");
        Logger.log("Plase run the setupProperties function and fill in all the properties");
    }

    return value;
}

var registration_spreadsheet_id = get_property("Class registration spreadsheet ID");
var registration_form_id        = get_property("Registration form ID");
var email_tests_form_id         = get_property("Email tests form ID");
var questions_spreadsheet_id    = get_property("Questions spreadsheet ID");
var certificate_template_id     = get_property("Certificate template ID");
var certificate_folder_id       = get_property("Certificate folder ID");
var config_spreadsheet_id       = get_property("Config spreadsheet ID");
var log_spreadsheet_id          = get_property("Logs Spreadsheet ID");

var log_sheet = SpreadsheetApp.openById(log_spreadsheet_id).getSheetByName("Current Log");
var log_id = Utilities.getUuid();

var DEBUG = "DEBUG";
var INFO = "INFO";
var WARN = "WARN";
var ERROR = "ERROR";
var FATAL = "FATAL";

// Log a message to the log spreadsheet
// severity: How severe the message is. See constants above
// context: an object describing any usefull information when the log is called
// message: the actual log message
function log(severity, context, message, start) {
    if (message) {
        log_sheet.appendRow([new Date(), severity, log_id, JSON.stringify(context), message]);
    } else {
        message = context;
        log_sheet.appendRow([new Date(), severity, log_id, "", message]);
    }
    Logger.log(severity + ": " + message);
}

function setupProperties() {
    properties.setProperties({
        "Class registration spreadsheet ID": "",
        "Registration form ID": "",
        "Email tests form ID": "",
        "Questions spreadsheet ID": "",
        "Certificate template ID": "",
        "Certificate folder ID": "",
        "Logs Spreadsheet ID": "",
    }, true);
}

function setupRegistrationForm() {
    log(INFO, {"f":"setupRegistrationForm"}, "Setting up registration form");
    var registration_form = FormApp.openById(registration_form_id);
    ScriptApp.newTrigger("onRegister").forForm(registration_form).onFormSubmit().create();
}

function setupEmailTestsForm() {
    log(INFO, {"f":"setupEmailTestsForm"}, "Setting up email tests form");
    var email_tests_form = FormApp.openById(email_tests_form_id);
    ScriptApp.newTrigger("onEmailTests").forForm(email_tests_form).onFormSubmit().create();
}

function onRegister(event) {

    var log_context = {'f':'onRegister'};

    log(INFO, {"f":"onRegister", "event":event}, "New registration");

    function failure_email(email) {
        log(WARN, {"f":"failure_email", "email": email}, "Sending failure email");
        GmailApp.sendEmail (
            email,
            "Safety Test Registration Failure",
            "Your attempt to register for a safety test has failed\n" +
            "This could be due to entering an incorrect class code, " +
            "the class not being available now, or registering twice for the same test"
        );
    }

    var form_items = event.response.getItemResponses();

    var form_info = form_items.reduce(function (info, item_response) {

        var item = item_response.getItem();
        var title = item.getTitle();

        if (title === "Class code") {
            var response = item_response.getResponse();
            info.class_code = response;
        }

        return info;

    }, {class_code: ""});
    log_context.form_info = form_info;

    var email = event.response.getRespondentEmail();
    log_context.email = email;

    var person = PersonLookup.lookupPerson("Email", email)
    log_context.person = person;

    var registration_spreadsheet = SpreadsheetApp.openById(registration_spreadsheet_id);
    var registration_sheet = registration_spreadsheet.getSheetByName(form_info.class_code);

    // check that class code exists
    if (registration_sheet == null) {
        log(WARN, log_context, "Student tried to register with invalid class code");
        failure_email(email);
        return;
    }

    // check if class is enabled
    if (!registration_sheet.getRange(2, 4).getValue()) {
        log(WARN, log_context, "Student tried to register for disabled class code");
        failure_email(email);
        return;
    }

    // check for duplicate
    var email_found = false;

    var last_row = registration_sheet.getLastRow();

    if (last_row > 3) {
        var email_column = registration_sheet.getRange(4, 2, last_row-3, 1).getValues();
        var email_found = email_column.some(function (current_email) { return current_email == email });
    }

    if (email_found) {
        log(WARN, log_context, "Duplicate email tried to register");
        failure_email(email);
        return;
    }

    log(INFO, log_context, "Successfull registration");

    // SUCCESS!
    GmailApp.sendEmail(
        email,
        "Safety Test Registration Success",
        "You have been registered to take the safety test\n" +
        "Your instructor will send an email with a link to your test"
    );

    registration_sheet.appendRow([
        new Date(),
        email,
        (person != null && person != undefined) ? person['First Name'] : "Not Found",
        (person != null && person != undefined) ? person['Last Name'] : "Not Found",
        (person != null && person != undefined) ? person['Banner ID'] : "Not Found",

    ]);

    log(DEBUG, log_context, "Sent email and append row for successful registration");

}

function onEmailTests(event) {
    // Get class code from form
    // For each person:
    //   look up name, id
    //   Generate unique url
    //   Send email

    var log_context = {'f': 'onEmailTests'};

    log_context.event = event;

    log(INFO, log_context, "Emailing tests");

    var form_items = event.response.getItemResponses();

    var form_info = form_items.reduce(function (info, item_response) {

        var item = item_response.getItem();
        var title = item.getTitle();

        if (title === "Class code") {
            var response = item_response.getResponse();
            info.class_code = response;
        }

        return info;

    }, {class_code: ""});
    log_context.form_info = form_info;

    var registration_spreadsheet = SpreadsheetApp.openById(registration_spreadsheet_id);
    var registration_sheet = registration_spreadsheet.getSheetByName(form_info.class_code);

    log(INFO, log_context, "Got info");

    var student_rows = registration_sheet.getDataRange().getValues().slice(3);
    log_context.student_rows = student_rows;

    log(INFO, log_context, "Sending emails");

    student_rows.forEach(function (student, index) {

        if (student[5] == "") {

            var email = student[1];

            registration_sheet.getRange(4 + index, 6).setValue(new Date());

            //var url = "https://script.google.com/a/students.rowan.edu/macros/s/AKfycbwa831Ouqu70OtgMsSLwX7Vmc8k3NPGHfTyKdJlpOEY/dev?class_code=" + form_info.class_code + "&id=" + index;
            var url = "https://script.google.com/a/students.rowan.edu/macros/s/AKfycbyOdS2_2pq_6GwCq76wXlwdbivFwkibEw0VyGMCeQHdnaZcb5Oi/exec?class_code=" + form_info.class_code + "&id=" + index;

            GmailApp.sendEmail(
                email,
                "ECE Safety Test",
                "Take your safety test here: " + url
            );
        }
    });
}

function parseQuestions(questions_spreadsheet) {
    var questions_spreadsheet_header_rows = 3;
    var questions_desired_locaion = 'B2';

    var category_sheets = questions_spreadsheet.getSheets();

    return category_sheets.map(function (sheet) {

        var range = sheet.getRange(questions_spreadsheet_header_rows + 1, 1, sheet.getLastRow() - questions_spreadsheet_header_rows, sheet.getLastColumn());
        var values = range.getValues();

        /*
         *  {
         *      name: Name of the category
         *      desired_questions: Number of questions that should be on a test from this category
         *      questions: A list of questions that could be on the test
         *  }
         */

        return {
            name: sheet.getName(),
            desired_questions: sheet.getRange(questions_desired_locaion).getValue(),
            questions: values.map(function (row, index) {

                /*
                 *  {
                 *      text: The text of the question
                 *      answers: A list of answers to the question
                 *  }
                 */

                //log(DEBUG, row);

                return {
                    text: row[0],
                    id: index,
                    category: sheet.getName(),
                    answers: row.slice(2, 6).map(function (answer, index) {

                        /*
                         *  {
                         *      text: The text of the answer
                         *      correct: whether this is the correct answer
                         *  }
                         */

                        //log(DEBUG, answer + " " + index + " " + row[1] + " " + (index === row[1] - 1));

                        return {
                            text: answer,
                            id: index + 1,
                        };
                    })
                };
            })
        };
    });
}

function parseConfig(config_sheet) {
    var log_context = {'f':'parseConfig'};

    log_context.config_sheet = config_sheet;

    log(INFO, log_context, "Parsing config");

    var config_range = config_sheet.getRange(4, 1, config_sheet.getLastRow()-3, 2);
    var config_values = config_range.getValues();
    log_context.config_value = config_values;

    log(DEBUG, log_context, "Read config sheet");

    var config = config_values.reduce(
        function (config, question) {
            config[question[0]] = question[1];
            return config;
        }, {}
    );

    log_context.config = config;

    log(DEBUG, log_context, "Parsed config");

    return config;
}

function randomizeQuestions(questions, config) {
    var randomized_questions = questions.reduce(function (randomized_questions, category) {

        if (category.name in config) {
            // Shuffle the answers of the questions
            category.questions.forEach(function (question) {
                //question.category = category.name;
                shuffleArray(question.answers);
            });

            shuffleArray(category.questions);

            var category_questions = category.questions.splice(0, config[category.name]);

            return randomized_questions.concat(category_questions);
        } else {
            return randomized_questions;
        }
    }, []);

    shuffleArray(randomized_questions);

    return randomized_questions;
}

function submitTest(responses) {
    var log_context = {'f': 'submitTest'};
    log_context.responses = responses;

    log(INFO, log_context, "Test submitted");

    var id = parseInt(responses.id);
    log_context.id = id;
    var class_code = responses.class_code;
    log_context.class_code = class_code;
    var questions = responses.answers;
    log_context.questions = questions;

    var questions_spreadsheet = SpreadsheetApp.openById(questions_spreadsheet_id);

    var total_questions = 0;
    var correct_questions = 0;

    log(INFO, log_context, "Grading test");

    questions.forEach(function (question) {
        var category = question.category;
        var id = question.id;
        var response = question.response;

        var questions_sheet = questions_spreadsheet.getSheetByName(category);
        var correct_response = questions_sheet.getRange(4 + id, 2).getValue();

        question.correct_response = correct_response;

        var total_count_range = questions_sheet.getRange(4 + id, 8);
        var correct_count_range = questions_sheet.getRange(4 + id, 7);

        total_questions += 1;
        total_count_range.setValue(total_count_range.getValue() + 1);

        if (response == correct_response) {
            correct_questions += 1;
            correct_count_range.setValue(correct_count_range.getValue() + 1);
            question.correct = true;
        } else {
            question.correct = false;
        }
    });

    var response_json = JSON.stringify(responses);
    var score = correct_questions / total_questions;
    log_context.score = score;
    var passed = score >= 0.8;
    log_context.passed = passed;

    var registration_spreadsheet = SpreadsheetApp.openById(registration_spreadsheet_id);
    var registration_sheet = registration_spreadsheet.getSheetByName(class_code);

    registration_sheet.getRange(id + 4, 8).setValue(new Date())
    registration_sheet.getRange(id + 4, 9).setValue(score)
    registration_sheet.getRange(id + 4, 10).setValue(passed)
    registration_sheet.getRange(id + 4, 11).setValue(response_json)

    var student_data = registration_sheet.getRange(id+4, 1, 1, 7).getValues()[0];
    log_context.student_data = student_data;

    var email = student_data[1];
    log_context.email = email;
    var first_name = student_data[2];
    log_context.first_name = first_name;
    var last_name = student_data[3];
    log_context.last_name = last_name;
    var banner_id = student_data[4];
    log_context.banner_id = banner_id;

    if (passed) {
        // Generate certificate and email it
        log(INFO, log_context, "Passed, generating certificate");

        var new_certificate_template_id = registration_sheet.getRange(2, 8).getValue();
        log_context.new_certificate_template_id = new_certificate_template_id;

        if (new_certificate_template_id == "" || new_certificate_template_id == null) {
            new_certificate_template_id = certificate_template_id;
            log(WARN, log_context, "no certificate id found, using default");
            log_context.new_certificate_template_id = new_certificate_template_id;
        }

        var certificate_template = DriveApp.getFileById(new_certificate_template_id);

        if (certificate_template == null) {
            certificate_template = DriveApp.getFileById(certificate_template_id);
            log(WARN, log_context, "could not open certificate template, using default");
        }

        var copyFile = certificate_template.makeCopy();

        var copyId = copyFile.getId();
        var copyDoc = DocumentApp.openById(copyId);
        var copyBody = copyDoc.getActiveSection();

        var today = new Date();
        var dd = today.getDate();
        var mm = today.getMonth()+1; //January is 0!
        var yyyy = today.getFullYear();

        if(dd<10) {
          dd = '0'+dd
        }

        if(mm<10) {
          mm = '0'+mm
        }

        var date = mm + '/' + dd + '/' + yyyy;

        copyBody.replaceText('<<FirstName>>', first_name);
        copyBody.replaceText('<<LastName>>', last_name);
        copyBody.replaceText('<<BannerID>>', banner_id);
        copyBody.replaceText('<<Email>>', email);
        //copyBody.replaceText('<<Department>>', department);
        //copyBody.replaceText('<<ClassCode>>', ece_class);
        //copyBody.replaceText('<<Section>>', section);
        copyBody.replaceText('<<CompletionDate>>', date);
        copyBody.replaceText('<<CalculatedScore>>', score*100);

        copyDoc.saveAndClose();

        var pdf = DriveApp.createFile(copyFile.getAs('application/pdf'));

        copyFile.setTrashed(true);

        var folder = DriveApp.getFolderById(certificate_folder_id);

        folder.addFile(pdf);

        var parents = pdf.getParents();

        while(parents.hasNext()) {
            var parent = parents.next();
            if(parent.getId() !== folder.getId()) {
                parent.removeFile(pdf);
            }
        }

        pdf.setName(banner_id + "_" + last_name + "_" + date);

        log(INFO, log_context, "Sending email");
        GmailApp.sendEmail(
            email,
            "ECE Safety Training Certificate",
            "Hello " + first_name + ",\n" +
            "\n" +
            "Attatched is your safety training certificate\n" +
            "\n" +
            "\n" +
            " - The ECE Depeartment",
            {attachments: [pdf]}
        );
    } else {
        log(INFO, log_context, "Failed, not generating certificate");
        GmailApp.sendEmail(
            email,
            "ECE Safety Test",
            "Hello " + first_name + ",\n" +
            "\n" +
            "We regret to inform you that you have failed your ECE safety test\n" +
            "You have achieved a score of " + score*100.0 + "%.\n" +
            "A score of 80% or above is considered passing.\n" +
            "\n" +
            " - The ECE Department"
        );
    }
}

function shuffleArray(array) {
    for (var i = array.length - 1; i > 0; i--) {
        var j = Math.floor(Math.random() * (i + 1));
        var temp = array[i];
        array[i] = array[j];
        array[j] = temp;
    }
    return array;
}

function doGet(event) {
    var log_context = {'f':'doGet'};
    log(INFO, log_context, "Serving request for test");

    var id = event.parameter.id;
    log_context.id = id;
    var class_code = event.parameter.class_code;
    log_context.class_code = class_code;

    if (id == undefined || id == null || class_code == undefined || class_code == null) {
        log(ERROR, log_context, "No ID or no class code in parameters");
        return HtmlService.createHtmlOutput("<p>Invalid Link</p>")
    }

    var registration_spreadsheet = SpreadsheetApp.openById(registration_spreadsheet_id);
    var registration_sheet = registration_spreadsheet.getSheetByName(class_code);

    var row_number = parseInt(id) + 4;
    log_context.row_number = row_number;

    if (registration_sheet == undefined || registration_sheet == null || row_number == NaN || row_number == null || row_number == undefined) {
        log(ERROR, log_context, "Could not open registration spreadsheet");
        return HtmlService.createHtmlOutput("<p>Invalid Link</p>")
    }

    var registration_range = registration_sheet.getRange(row_number, 1, 1, registration_sheet.getLastColumn());
    var registration_row = registration_range.getValues()[0];
    log_context.registration_row = registration_row;

    var config_name = registration_sheet.getRange(2, 6).getValue();
    log_context.config_name = config_name;

    var emailed = registration_row[5];
    log_context.emailed = emailed;
    var clicked_link = registration_row[6];
    log_context.clicked_link = clicked_link;

    log(INFO, log_context, "Read registration sheet");

    if (emailed == "" || emailed == null || emailed == undefined) {
        log(ERROR, log_context, "Got request from id that was not emailed");
        return HtmlService.createHtmlOutput("<p>Invalid Link</p>");
    }

    if (clicked_link != "") {
        log(WARN, log_context, "Student tried to click link twice");
        return HtmlService.createHtmlOutput(
            "<p>This test has already been taken</p>"
        );
    }

    registration_sheet.getRange(row_number, 7).setValue(new Date());

    var t = HtmlService.createTemplateFromFile('index.html');

    t.id = id;
    t.class_code = class_code;
    t.config_name = config_name;

    var e = t.evaluate();

    log(INFO, log_context, "Sent out test");

    return e;
}

function getQuestions(config_name) {
    var log_context = {'f':'getQuestions'};
    log_context.config_name = config_name;

    log(INFO, log_context, "Getting questions");

    var questions_sheet = SpreadsheetApp.openById(questions_spreadsheet_id);
    var questions = parseQuestions(questions_sheet);
    log_context.questions = questions;

    var config_sheet = SpreadsheetApp.openById(config_spreadsheet_id).getSheetByName(config_name);
    var config = parseConfig(config_sheet);
    log_context.config = config;

    var random_questions = randomizeQuestions(questions, config);
    log_context.random_questions = random_questions;

    random_questions.map(function (question) {
        question.answers.map(function (answer) {
            answer.correct = undefined;
        });
    });

    log(INFO, log_context, "Got questions");

    return random_questions;
}

function include(filename) {
    return HtmlService.createHtmlOutputFromFile(filename)
        .getContent();
}

function tests() {
    var hello = arguments;
    Logger.log(hello);
    Logger.log(arguments.callee.name)
    Logger.log(JSON.stringify(arguments))
}

function tests2() {
    tests();
}

