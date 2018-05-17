
function onQuestionsLoad(questions) {

    console.log(questions);

    var questions_list = new QuestionList(questions);

    /*
    var question1 = new Question({
        text: "Question 1",
        id: 1,
        answers: [
            {
                text: "answer 5",
                id: 5
            },
            {
                text: "answer 4",
                id: 4
            },
            {
                text: "answer 3",
                id: 3
            },
            {
                text: "answer 1",
                id: 1
            },
            {
                text: "answer 2",
                id: 2
            }
        ]
    });

    var questions_element = document.getElementById("questions");
    questions_element.appendChild(question1.element);
    */

    var questions_list_element = document.getElementById("questions");
    questions_list_element.appendChild(questions_list.element);


    var submit_button = document.getElementById("submit_button");

    submit_button.onclick = function(event) {
        console.log(questions_list.getAnswers());
    }

}

google.script.run.withSuccessHandler(onQuestionsLoad).getQuestions();

