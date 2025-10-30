
import React, { useState, useEffect, useMemo, CSSProperties } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";
import { useForm, FormProvider, useFormContext, useController, SubmitHandler } from 'react-hook-form';

// --- TYPES ---
interface SurveyOption {
    value: string;
    label: string;
}

interface Question {
    id: string;
    type: 'text' | 'textarea' | 'radio' | 'checkbox' | 'dropdown' | 'slider' | 'star_rating';
    label: string;
    required: boolean;
    options?: SurveyOption[];
    min?: number;
    max?: number;
    step?: number;
    count?: number; // For star rating
}

interface Page {
    id: string;
    title: string;
    questions: Question[];
}

interface Theme {
    primaryColor: string;
    backgroundColor: string;
    textColor: string;
    questionTextColor: string;
    answerTextColor: string;
    fontFamily: string;
    borderRadius: string;
}

interface Survey {
    title: string;
    description: string;
    config: {
        theme: Theme;
        pages: Page[];
    };
}

type SurveyFormData = Record<string, any>;

// --- GEMINI API SETUP ---
const API_KEY = process.env.API_KEY;
const ai = new GoogleGenAI({ apiKey: API_KEY });

const surveySchema = {
  type: Type.OBJECT,
  properties: {
    title: { type: Type.STRING, description: "Creative and engaging title for the survey." },
    description: { type: Type.STRING, description: "A captivating description of the survey's purpose." },
    config: {
      type: Type.OBJECT,
      properties: {
        theme: {
          type: Type.OBJECT,
          properties: {
            primaryColor: { type: Type.STRING, description: "Primary theme color in hex format (e.g., #6200ee)." },
            backgroundColor: { type: Type.STRING, description: "Survey card background color in hex format (e.g., #ffffff)." },
            textColor: { type: Type.STRING, description: "Main text color for title/description in hex format (e.g., #121212)." },
            questionTextColor: { type: Type.STRING, description: "Color for question labels in hex format." },
            answerTextColor: { type: Type.STRING, description: "Color for answer/option text in hex format." },
            fontFamily: { type: Type.STRING, description: "A web-safe font family from Google Fonts (e.g., 'Roboto, sans-serif')." },
            borderRadius: { type: Type.STRING, description: "CSS border-radius value (e.g., '12px')." }
          },
          required: ["primaryColor", "backgroundColor", "textColor", "questionTextColor", "answerTextColor", "fontFamily", "borderRadius"]
        },
        pages: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              id: { type: Type.STRING },
              title: { type: Type.STRING },
              questions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    type: { type: Type.STRING, description: "Type: 'text', 'textarea', 'radio', 'checkbox', 'dropdown', 'slider', or 'star_rating'." },
                    label: { type: Type.STRING, description: "The question text, can include emojis." },
                    required: { type: Type.BOOLEAN },
                    options: {
                      type: Type.ARRAY,
                      nullable: true,
                      items: {
                        type: Type.OBJECT,
                        properties: {
                          value: { type: Type.STRING },
                          label: { type: Type.STRING, description: "Option label, can include emojis." }
                        },
                        required: ["value", "label"]
                      }
                    },
                    min: { type: Type.NUMBER, nullable: true, description: "Minimum value for a slider." },
                    max: { type: Type.NUMBER, nullable: true, description: "Maximum value for a slider." },
                    step: { type: Type.NUMBER, nullable: true, description: "Step value for a slider." },
                    count: { type: Type.NUMBER, nullable: true, description: "Number of stars for a star_rating question (e.g., 5)." }
                  },
                  required: ["id", "type", "label", "required"]
                }
              }
            },
            required: ["id", "title", "questions"]
          }
        }
      },
      required: ["theme", "pages"]
    }
  },
  required: ["title", "description", "config"]
};


// --- STYLES ---
const GlobalStyles = () => (
    <style>{`
        .survey-card {
            width: 100%;
            padding: 2rem;
            box-sizing: border-box;
            box-shadow: 0 10px 30px rgba(0,0,0,0.1);
            transition: all 0.5s ease-in-out;
            opacity: 0;
            transform: translateY(20px);
        }
        .survey-card.visible {
            opacity: 1;
            transform: translateY(0);
        }
        .survey-card h1 { margin-top: 0; font-size: 2.2rem; }
        .survey-card p { font-size: 1.1rem; opacity: 0.9; margin-bottom: 2rem; }
        .page-title {
            font-size: 1.5rem;
            font-weight: bold;
            margin-top: 2rem;
            margin-bottom: 1.5rem;
            padding-bottom: 0.5rem;
            border-bottom: 2px solid var(--primary-color);
        }
        .question-box { margin-bottom: 1.5rem; }
        .question-label { display: block; font-size: 1.2rem; margin-bottom: 0.75rem; }
        .input-base {
            width: 100%;
            padding: 12px;
            border: 1px solid #ccc;
            box-sizing: border-box;
            font-size: 1rem;
            transition: border-color 0.3s, box-shadow 0.3s;
        }
        .input-base:focus {
            outline: none;
            border-color: var(--primary-color);
            box-shadow: 0 0 0 3px var(--primary-color-alpha);
        }
        textarea.input-base { min-height: 120px; resize: vertical; }
        .radio-group, .checkbox-group { display: flex; flex-direction: column; gap: 0.8rem; }
        .option-label { display: flex; align-items: center; cursor: pointer; }
        .option-label input { margin-right: 10px; }
        .slider-container { display: flex; align-items: center; gap: 1rem; }
        .slider-container input[type="range"] { flex-grow: 1; }
        .slider-value { font-weight: bold; min-width: 30px; text-align: center; }
        .star-rating-container { display: 'flex'; }
        .star { cursor: pointer; color: #ccc; font-size: 2em; margin-right: 5px; transition: color 0.2s; }
        .star.filled { color: var(--primary-color); }

        .form-error { color: #d8000c; font-size: 0.9em; margin-top: 5px; }

        .submit-btn {
            padding: 12px 25px;
            font-size: 1.1rem;
            font-weight: bold;
            border: none;
            cursor: pointer;
            border-radius: var(--border-radius);
            margin-top: 2rem;
            transition: background-color 0.3s, transform 0.2s;
        }
        .submit-btn:hover { transform: translateY(-2px); }

        .submission-result {
            margin-top: 20px;
            padding: 15px;
            border-radius: 8px;
            background-color: #e6ffe6;
            border: 1px solid #c3e6cb;
            white-space: pre-wrap;
            word-break: break-all;
        }

        .next-survey-btn {
            position: fixed;
            bottom: 30px;
            right: 30px;
            padding: 15px 30px;
            font-size: 1.1rem;
            font-weight: bold;
            border: none;
            cursor: pointer;
            border-radius: 50px;
            box-shadow: 0 4px 15px rgba(0,0,0,0.2);
            transition: all 0.3s ease;
            z-index: 1000;
        }
        .next-survey-btn:hover { transform: translateY(-3px) scale(1.05); box-shadow: 0 6px 20px rgba(0,0,0,0.3); }
        .next-survey-btn:active { transform: translateY(-1px) scale(1.02); }

        .loader {
          width: 60px;
          height: 60px;
          border-radius: 50%;
          display: inline-block;
          position: relative;
          border: 3px solid;
          border-color: #FFF #FFF transparent transparent;
          box-sizing: border-box;
          animation: rotation 1s linear infinite;
        }
        .loader::after,
        .loader::before {
          content: '';  
          box-sizing: border-box;
          position: absolute;
          left: 0;
          right: 0;
          top: 0;
          bottom: 0;
          margin: auto;
          border: 3px solid;
          border-color: transparent transparent var(--primary-color) var(--primary-color);
          width: 50px;
          height: 50px;
          border-radius: 50%;
          animation: rotationBack 0.5s linear infinite;
          transform-origin: center center;
        }
        .loader::before {
          width: 40px;
          height: 40px;
          border-color: #FFF #FFF transparent transparent;
          animation: rotation 1.5s linear infinite;
        }
            
        @keyframes rotation {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
        @keyframes rotationBack {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(-360deg); }
        }
        .error-message {
            background-color: #ffdddd;
            color: #d8000c;
            padding: 1rem;
            border: 1px solid #d8000c;
            border-radius: 8px;
            text-align: center;
        }
    `}</style>
);

// --- QUESTION COMPONENTS ---

const ErrorMessage: React.FC<{ name: string }> = ({ name }) => {
    const { formState: { errors } } = useFormContext();
    const error = errors[name];
    return error ? <p className="form-error">{(error as any).message}</p> : null;
};

const TextQuestionComponent: React.FC<{ question: Question }> = ({ question }) => {
    const { register } = useFormContext();
    return (
        <>
            <input type="text" {...register(question.id, { required: question.required ? 'This field is required' : false })} className="input-base" style={{ borderRadius: 'var(--border-radius)' }} />
            <ErrorMessage name={question.id} />
        </>
    );
};

const TextareaQuestionComponent: React.FC<{ question: Question }> = ({ question }) => {
    const { register } = useFormContext();
    return (
        <>
            <textarea {...register(question.id, { required: question.required ? 'This field is required' : false })} className="input-base" style={{ borderRadius: 'var(--border-radius)' }}></textarea>
            <ErrorMessage name={question.id} />
        </>
    );
};

const DropdownQuestionComponent: React.FC<{ question: Question }> = ({ question }) => {
    const { register } = useFormContext();
    return (
        <>
            <select {...register(question.id, { required: question.required ? 'Please select an option' : false })} className="input-base" style={{ borderRadius: 'var(--border-radius)' }}>
                <option value="">Select...</option>
                {question.options?.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
            </select>
            <ErrorMessage name={question.id} />
        </>
    );
};

const RadioQuestionComponent: React.FC<{ question: Question }> = ({ question }) => {
    const { register } = useFormContext();
    return (
        <div className="radio-group">
            {question.options?.map(opt => (
                <label key={opt.value} className="option-label" style={{ color: 'var(--answer-text-color)' }}>
                    <input type="radio" {...register(question.id, { required: question.required ? 'Please select an option' : false })} value={opt.value} />
                    <span>{opt.label}</span>
                </label>
            ))}
            <ErrorMessage name={question.id} />
        </div>
    );
};

const CheckboxQuestionComponent: React.FC<{ question: Question }> = ({ question }) => {
    const { register } = useFormContext();
    return (
        <div className="checkbox-group">
            {question.options?.map(opt => (
                <label key={opt.value} className="option-label" style={{ color: 'var(--answer-text-color)' }}>
                    <input type="checkbox" {...register(question.id, { required: question.required ? 'Please select at least one option' : false })} value={opt.value} />
                    <span>{opt.label}</span>
                </label>
            ))}
            <ErrorMessage name={question.id} />
        </div>
    );
};

const SliderQuestionComponent: React.FC<{ question: Question }> = ({ question }) => {
    const { control } = useFormContext();
    const { field } = useController({ name: question.id, control, defaultValue: question.min ?? 50 });
    const [sliderValue, setSliderValue] = useState(field.value);

    return (
        <div className="slider-container">
            <input
                type="range"
                min={question.min}
                max={question.max}
                step={question.step}
                value={sliderValue}
                onChange={(e) => {
                    const value = Number(e.target.value);
                    field.onChange(value);
                    setSliderValue(value);
                }}
            />
            <span className="slider-value" style={{ color: 'var(--primary-color)' }}>{sliderValue}</span>
        </div>
    );
};

const StarRatingQuestionComponent: React.FC<{ question: Question }> = ({ question }) => {
    const { control, setValue } = useFormContext();
    const { field } = useController({ name: question.id, control, rules: { required: question.required ? 'Please provide a rating' : false }, defaultValue: 0 });
    const [hoverRating, setHoverRating] = useState(0);
    const count = question.count ?? 5;

    return (
        <>
            <div className="star-rating-container" onMouseLeave={() => setHoverRating(0)}>
                {[...Array(count)].map((_, index) => {
                    const ratingValue = index + 1;
                    return (
                        <span
                            key={ratingValue}
                            className={`star ${ratingValue <= (hoverRating || field.value) ? 'filled' : ''}`}
                            onMouseEnter={() => setHoverRating(ratingValue)}
                            onClick={() => setValue(question.id, ratingValue, { shouldValidate: true })}
                        >
                            &#9733;
                        </span>
                    );
                })}
            </div>
            <ErrorMessage name={question.id} />
        </>
    );
};

const componentRegistry: Record<string, React.ComponentType<any>> = {
    'text': TextQuestionComponent,
    'textarea': TextareaQuestionComponent,
    'radio': RadioQuestionComponent,
    'checkbox': CheckboxQuestionComponent,
    'dropdown': DropdownQuestionComponent,
    'slider': SliderQuestionComponent,
    'star_rating': StarRatingQuestionComponent,
};

const SurveyRenderer: React.FC<{ pages: Page[] }> = ({ pages }) => {
    return (
        <>
            {pages.map(page => (
                <div key={page.id}>
                    <h2 className="page-title">{page.title}</h2>
                    {page.questions.map(q => {
                        const QuestionComponent = componentRegistry[q.type];
                        return (
                            <div key={q.id} className="question-box">
                                <label className="question-label" style={{ color: 'var(--question-text-color)' }}>
                                    {q.label} {q.required && <span style={{ color: 'var(--primary-color)' }}>*</span>}
                                </label>
                                {QuestionComponent ? <QuestionComponent question={q} /> : <p>Unsupported question type.</p>}
                            </div>
                        );
                    })}
                </div>
            ))}
        </>
    );
};

// --- CORE COMPONENTS ---

const Loader: React.FC = () => <div className="loader"></div>;

const SurveyCard: React.FC<{ survey: Survey; isVisible: boolean; onSubmit: SubmitHandler<SurveyFormData>; submissionResult: string | null }> = ({ survey, isVisible, onSubmit, submissionResult }) => {
    const { theme } = survey.config;
    const { handleSubmit } = useFormContext();

    const surveyStyle: CSSProperties & { '--primary-color': string; '--primary-color-alpha': string; '--border-radius': string; } = {
        '--primary-color': theme.primaryColor,
        '--primary-color-alpha': `${theme.primaryColor}33`,
        backgroundColor: theme.backgroundColor,
        color: theme.textColor,
        fontFamily: theme.fontFamily,
        '--border-radius': theme.borderRadius
    };
    
    useEffect(() => {
        document.body.style.backgroundColor = theme.backgroundColor === '#121212' || theme.backgroundColor === '#000000' ? '#212121' : '#f0f2f5';
    }, [theme.backgroundColor]);

    return (
        <div className={`survey-card ${isVisible ? 'visible' : ''}`} style={surveyStyle}>
            <h1>{survey.title}</h1>
            <p>{survey.description}</p>
            <form onSubmit={handleSubmit(onSubmit)}>
                <SurveyRenderer pages={survey.config.pages} />
                <button type="submit" className="submit-btn" style={{ backgroundColor: theme.primaryColor, color: theme.backgroundColor }}>
                    Submit Survey
                </button>
            </form>
            {submissionResult && (
                <div className="submission-result">
                    <h3>Submission Successful!</h3>
                    <pre>{submissionResult}</pre>
                </div>
            )}
        </div>
    );
};

const App: React.FC = () => {
    const [currentSurvey, setCurrentSurvey] = useState<Survey | null>(null);
    const [nextSurvey, setNextSurvey] = useState<Survey | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [isFetchingNext, setIsFetchingNext] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [isVisible, setIsVisible] = useState(false);
    const [submissionResult, setSubmissionResult] = useState<string | null>(null);
    const methods = useForm<SurveyFormData>();

    const fetchNewSurvey = async (): Promise<Survey> => {
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: "Generate a fun, engaging, and visually stunning survey. The theme should have vibrant, harmonious colors with good contrast. Include a creative title, a captivating description, and 1-2 pages, each with 2-4 varied questions (text, radio, checkbox, slider, and the new 'star_rating'). Questions should be creative and use emojis (e.g., 'Rate your energy level today ⚡️'). For sliders, provide logical min/max/step values. For star_ratings, use a count of 5. Strictly adhere to the provided schema. Make it awesome!",
            config: {
                responseMimeType: "application/json",
                responseSchema: surveySchema
            }
        });
        return JSON.parse(response.text) as Survey;
    };

    const loadNextSurveyInBackground = async () => {
        if (isFetchingNext) return;
        setIsFetchingNext(true);
        try {
            const surveyData = await fetchNewSurvey();
            setNextSurvey(surveyData);
        } catch (e) {
            console.error("Failed to fetch next survey in background:", e);
            // Optionally handle background fetch error, but don't block the UI
        } finally {
            setIsFetchingNext(false);
        }
    };

    useEffect(() => {
        const initialLoad = async () => {
            setIsLoading(true);
            setError(null);
            try {
                const surveyData = await fetchNewSurvey();
                setCurrentSurvey(surveyData);
                loadNextSurveyInBackground(); // Pre-fetch the next one
            } catch (e) {
                console.error(e);
                setError('Failed to generate the initial survey. Please try again!');
            } finally {
                setIsLoading(false);
                setTimeout(() => setIsVisible(true), 100);
            }
        };
        initialLoad();
    }, []);

    const handleShowNextSurvey = async () => {
        if (nextSurvey) {
            setIsVisible(false);
            setTimeout(() => {
                setCurrentSurvey(nextSurvey);
                setNextSurvey(null);
                methods.reset();
                setSubmissionResult(null);
                setIsVisible(true);
                loadNextSurveyInBackground(); // Fetch the next one
            }, 500); // Wait for fade out animation
        } else {
            // Fallback if the next survey isn't ready yet
            setIsVisible(false);
            setIsLoading(true);
            setError(null);
            setSubmissionResult(null);
            methods.reset();
            try {
                const surveyData = await fetchNewSurvey();
                setCurrentSurvey(surveyData);
                loadNextSurveyInBackground();
            } catch (e) {
                console.error(e);
                setError('Failed to generate a new survey. Please try again!');
            } finally {
                setIsLoading(false);
                setTimeout(() => setIsVisible(true), 100);
            }
        }
    };
    
    const onSubmit: SubmitHandler<SurveyFormData> = (data) => {
        console.log("Survey Answers Submitted:", data);
        setSubmissionResult(JSON.stringify(data, null, 2));
    };

    const buttonStyle = useMemo(() => {
        if (!currentSurvey) return {};
        return {
            backgroundColor: currentSurvey.config.theme.primaryColor,
            color: currentSurvey.config.theme.backgroundColor,
        };
    }, [currentSurvey]);

    return (
        <>
            <GlobalStyles />
            {isLoading && <Loader />}
            {error && !isLoading && <div className="error-message">{error}</div>}
            <FormProvider {...methods}>
                {!isLoading && currentSurvey && (
                    <SurveyCard survey={currentSurvey} isVisible={isVisible} onSubmit={onSubmit} submissionResult={submissionResult} />
                )}
            </FormProvider>
            <button
                className="next-survey-btn"
                onClick={handleShowNextSurvey}
                style={buttonStyle}
                disabled={isLoading}
                aria-label="Generate New Survey"
            >
                {isLoading ? 'Generating...' : 'Next Survey ✨'}
            </button>
        </>
    );
};


const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);
root.render(<App />);
